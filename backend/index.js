/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onRequest } = require("firebase-functions/v2/https");
const { onValueCreated } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const Busboy = require("busboy");
const path = require("path");
const os = require("os");
const fs = require("fs");
require('dotenv').config({ path: path.join(__dirname, '.env') });
// fallback if not found or if running in logic that needs it
if (!process.env.MASTER_FOLDER_ID) {
    require('dotenv').config();
}

admin.initializeApp();
const db = admin.database(); // Realtime Database

// --- Configuration ---
const MASTER_FOLDER_ID = process.env.MASTER_FOLDER_ID;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

// Helper to get authenticated Drive Client
async function getDriveClient() {
    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
        throw new Error("Missing OAuth configured in .env (GOOGLE_CLIENT_ID, etc)");
    }
    const oauth2Client = new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        "https://developers.google.com/oauthplayground" // Redirect URI (unused here)
    );
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth: oauth2Client });
}

// 1. User Onboarding: Create Folder in Drive
// Trigger on creation of /users/{userId}
// 1. User Onboarding: Create Folder in Drive
// Trigger on creation of /users/{userId}
exports.onUserCreate = onValueCreated({
    ref: "/users/{userId}",
    instance: "*", // Listen to all instances (helps in emulators)
    region: "us-central1"
}, async (event) => {
    // ... (keep existing logic for backward compatibility/server-side trigger) ...
    const snapshot = event.data;
    if (!snapshot) return;
    const userId = event.params.userId;
    const userData = snapshot.val();
    const userEmail = userData.email || `User ${userId}`;

    // CHECK IF FOLDER ALREADY EXISTS via DB check to prevent duplicates if manually triggered too
    if (userData.driveFolderId) {
        logger.info(`User ${userId} already has a folder. Skipping trigger.`);
        return;
    }

    logger.info(`Creating Drive folder for user: ${userId} (${userEmail})`);

    try {
        const drive = await getDriveClient();
        const fileMetadata = {
            name: `${userEmail}_Vault`,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [MASTER_FOLDER_ID]
        };
        const file = await drive.files.create({ resource: fileMetadata, fields: 'id' });
        logger.info(`Created folder with ID: ${file.data.id}`);

        await snapshot.ref.update({
            driveFolderId: file.data.id,
            driveFolderCreatedAt: Date.now()
        });
    } catch (error) {
        logger.error("Error creating Google Drive folder", error);
    }
});

// 1.5 Manual Initialization Endpoint (HTTP)
exports.initializeUser = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const tokenId = req.headers.authorization?.split('Bearer ')[1];
    if (!tokenId) return res.status(401).send('Unauthorized');

    try {
        const decodedToken = await admin.auth().verifyIdToken(tokenId);
        const userId = decodedToken.uid;
        const userEmail = decodedToken.email;

        // Check if already initialized in DB
        const userRef = db.ref(`users/${userId}`);
        const snapshot = await userRef.once('value');
        if (snapshot.exists() && snapshot.val().driveFolderId) {
            return res.status(200).json({ success: true, message: 'Already initialized', folderId: snapshot.val().driveFolderId });
        }

        const drive = await getDriveClient();
        const folderName = `${userEmail}_Vault`;

        // Check availability in Drive (prevent duplicates)
        const existing = await drive.files.list({
            q: `name = '${folderName}' and '${MASTER_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
        });

        let folderId;

        if (existing.data.files && existing.data.files.length > 0) {
            // Use existing folder
            folderId = existing.data.files[0].id;
            logger.info(`Found existing folder for ${userEmail}: ${folderId}`);
        } else {
            // Create new
            const fileMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [MASTER_FOLDER_ID]
            };
            const file = await drive.files.create({
                resource: fileMetadata,
                fields: 'id'
            });
            folderId = file.data.id;
            logger.info(`Created new folder for ${userEmail}: ${folderId}`);
        }

        await userRef.update({
            email: userEmail,
            driveFolderId: folderId,
            driveFolderCreatedAt: Date.now() // Use timestamp
        });

        res.status(200).json({ success: true, folderId: folderId });

    } catch (err) {
        logger.error("Manual Init Error", err);
        res.status(500).send(err.message);
    }
});

// 2. Upload File (Stream to Drive)
exports.uploadFile = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    // AUTHENTICATION CHECK
    const tokenId = req.headers.authorization?.split('Bearer ')[1];
    if (!tokenId) {
        return res.status(401).send('Unauthorized: No token provided');
    }

    let decodedToken;
    let rootFolderId;

    try {
        decodedToken = await admin.auth().verifyIdToken(tokenId);
        // Fetch from Realtime DB
        const snapshot = await db.ref(`users/${decodedToken.uid}`).once('value');
        if (!snapshot.exists()) {
            return res.status(404).send('User profile not found');
        }
        rootFolderId = snapshot.val().driveFolderId;
        if (!rootFolderId) {
            return res.status(400).send('User does not have a Drive folder assigned');
        }
    } catch (error) {
        logger.error("Auth Error", error);
        return res.status(403).send('Unauthorized: Invalid token');
    }

    // Target Folder: Use query param or default to Root
    const driveFolderId = req.query.folderId || rootFolderId;

    const busboy = Busboy({ headers: req.headers });
    let fileStream;
    let fileName;
    let mimeType;

    busboy.on('file', (name, file, info) => {
        const { filename, mimeType: mimetype } = info;
        fileName = filename;
        mimeType = mimetype;
        fileStream = file;

        // Perform upload when file is available
        const drivePromise = (async () => {
            const drive = await getDriveClient();
            const requestBody = {
                name: fileName,
                parents: [driveFolderId]
            };
            const media = {
                mimeType: mimeType,
                body: fileStream
            };

            try {
                const response = await drive.files.create({
                    requestBody,
                    media: media,
                    fields: 'id, name, webViewLink, webContentLink'
                });
                return response.data;
            } catch (err) {
                logger.error("Drive Upload Error", err);
                throw err;
            }
        })();

        // Wait for upload
        drivePromise.then((data) => {
            res.status(200).json({ success: true, data });
        }).catch((err) => {
            file.resume(); // Drain stream
            res.status(500).json({ error: err.message });
        });
    });

    busboy.on('error', (error) => {
        logger.error("Busboy Error", error);
        res.status(500).send('Upload failed');
    });

    busboy.end(req.rawBody);
});

// 3. List Files (Supports ?folderId=... & ?view=...)
exports.listFiles = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).send('Method Not Allowed');
    }

    const tokenId = req.headers.authorization?.split('Bearer ')[1];
    if (!tokenId) {
        return res.status(401).send('Unauthorized: No token provided');
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(tokenId);
        // Realtime DB fetch
        const snapshot = await db.ref(`users/${decodedToken.uid}`).once('value');

        if (!snapshot.exists() || !snapshot.val().driveFolderId) {
            return res.status(404).send('User folder not found');
        }

        const rootFolderId = snapshot.val().driveFolderId;
        const targetFolderId = req.query.folderId || rootFolderId;
        const view = req.query.view || 'my-files'; // 'my-files', 'recent', 'shared', 'trash'

        const drive = await getDriveClient();

        const sortField = req.query.sortField || 'name'; // 'name', 'createdTime', 'size'
        const sortOrder = req.query.sortOrder || 'asc'; // 'asc', 'desc'

        let query = '';
        let orderBy = '';

        // Construct orderBy for Google Drive API
        if (sortField === 'name') {
            orderBy = `folder, name ${sortOrder}`;
        } else if (sortField === 'createdTime') {
            orderBy = `createdTime ${sortOrder}`;
        } else if (sortField === 'size') {
            orderBy = `quotaBytesUsed ${sortOrder}`;
        } else {
            orderBy = `folder, name ${sortOrder}`;
        }

        switch (view) {
            case 'recent':
                query = `'${rootFolderId}' in parents and trashed = false`;
                orderBy = 'createdTime desc'; // Force recent to time desc
                break;
            case 'shared':
                query = `sharedWithMe = true and trashed = false`;
                break;
            case 'trash':
                query = `'${rootFolderId}' in parents and trashed = true`;
                break;
            case 'my-files':
            default:
                query = `'${targetFolderId}' in parents and trashed = false`;
                break;
        }

        const response = await drive.files.list({
            q: query,
            orderBy: orderBy,
            fields: 'nextPageToken, files(id, name, mimeType, webViewLink, webContentLink, thumbnailLink, size, createdTime)',
            spaces: 'drive',
        });

        res.status(200).json({ files: response.data.files, currentFolderId: targetFolderId, rootFolderId });

    } catch (error) {
        logger.error("List Files Error", error);
        res.status(500).send(error.message);
    }
});

// 4. Create Folder
exports.createFolder = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const tokenId = req.headers.authorization?.split('Bearer ')[1];
    if (!tokenId) return res.status(401).send('Unauthorized');

    try {
        const decodedToken = await admin.auth().verifyIdToken(tokenId);
        const { name, parentId } = req.body;

        if (!name) return res.status(400).send("Missing folder name");

        // Use provided parentId or default to Root
        let finalParentId = parentId;
        if (!finalParentId) {
            const snapshot = await db.ref(`users/${decodedToken.uid}`).once('value');
            if (snapshot.exists()) {
                finalParentId = snapshot.val().driveFolderId;
            }
        }

        if (!finalParentId) return res.status(400).send("No parent folder found");

        const drive = await getDriveClient();
        const fileMetadata = {
            name: name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [finalParentId]
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            fields: 'id, name, mimeType'
        });

        res.status(200).json(file.data);

    } catch (err) {
        logger.error("Create Folder Error", err);
        res.status(500).send(err.message);
    }
});

// 5. Delete (Trash) Item
exports.deleteItem = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== 'DELETE') return res.status(405).send('Method Not Allowed');

    const tokenId = req.headers.authorization?.split('Bearer ')[1];
    if (!tokenId) return res.status(401).send('Unauthorized');

    const { fileId } = req.query;
    if (!fileId) return res.status(400).send('Missing fileId');

    try {
        await admin.auth().verifyIdToken(tokenId);
        const drive = await getDriveClient();

        await drive.files.update({
            fileId: fileId,
            requestBody: { trashed: true }
        });

        res.status(200).json({ success: true });
    } catch (err) {
        logger.error("Delete Error", err);
        res.status(500).send(err.message);
    }
});

// 6. Restore Item
exports.restoreItem = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const tokenId = req.headers.authorization?.split('Bearer ')[1];
    if (!tokenId) return res.status(401).send('Unauthorized');

    const { fileId } = req.query;
    if (!fileId) return res.status(400).send('Missing fileId');

    try {
        await admin.auth().verifyIdToken(tokenId);
        const drive = await getDriveClient();

        await drive.files.update({
            fileId: fileId,
            requestBody: { trashed: false }
        });

        res.status(200).json({ success: true });
    } catch (err) {
        logger.error("Restore Error", err);
        res.status(500).send(err.message);
    }
});

// 7. Rename Item
exports.renameItem = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const tokenId = req.headers.authorization?.split('Bearer ')[1];
    if (!tokenId) return res.status(401).send('Unauthorized');

    const { fileId, newName } = req.body;
    if (!fileId || !newName) return res.status(400).send('Missing fileId or newName');

    try {
        await admin.auth().verifyIdToken(tokenId);
        const drive = await getDriveClient();

        await drive.files.update({
            fileId: fileId,
            requestBody: { name: newName }
        });

        res.status(200).json({ success: true });
    } catch (err) {
        logger.error("Rename Error", err);
        res.status(500).send(err.message);
    }
});
