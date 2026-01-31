const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const Busboy = require('busboy');
const path = require('path');
const os = require('os');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS Configuration
app.use(cors({
    origin: [
        'https://jnis-cloud-project.web.app',
        'https://jnis-cloud-project.firebaseapp.com',
        'http://localhost:5173'
    ],
    credentials: true
}));

app.use(express.json());

// Configuration
const MASTER_FOLDER_ID = process.env.MASTER_FOLDER_ID;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

// Helper to get authenticated Drive Client
async function getDriveClient() {
    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
        throw new Error("Missing OAuth credentials");
    }
    const oauth2Client = new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"
    );
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth: oauth2Client });
}

// Initialize User - Create Google Drive Folder and Return User's Root Folder
app.post('/initializeUser', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization required' });
        }

        const drive = await getDriveClient();
        const token = authHeader.split('Bearer ')[1];
        const folderName = `User_${token.substring(0, 10)}`;

        // Check if user folder already exists
        const searchResponse = await drive.files.list({
            q: `name='${folderName}' and '${MASTER_FOLDER_ID}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
            fields: 'files(id, name)',
            pageSize: 1
        });

        let userFolderId;

        if (searchResponse.data.files && searchResponse.data.files.length > 0) {
            // User folder exists
            userFolderId = searchResponse.data.files[0].id;
        } else {
            // Create new user folder
            const folderMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [MASTER_FOLDER_ID]
            };

            const folder = await drive.files.create({
                resource: folderMetadata,
                fields: 'id, name'
            });

            userFolderId = folder.data.id;
        }

        res.json({
            folderId: userFolderId,
            rootFolderId: userFolderId,
            message: 'User initialized successfully'
        });
    } catch (error) {
        console.error('Initialize error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Upload File - User Isolated
app.post('/uploadFile', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization required' });
        }

        const drive = await getDriveClient();
        const token = authHeader.split('Bearer ')[1];
        const userFolderName = `User_${token.substring(0, 10)}`;

        // Get user's root folder
        const searchResponse = await drive.files.list({
            q: `name='${userFolderName}' and '${MASTER_FOLDER_ID}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
            fields: 'files(id, name)',
            pageSize: 1
        });

        if (!searchResponse.data.files || searchResponse.data.files.length === 0) {
            return res.status(400).json({ error: 'User folder not found. Please refresh the page.' });
        }

        const userRootFolderId = searchResponse.data.files[0].id;
        const requestedFolderId = req.query.folderId;

        // Use user's root folder if no folder specified or if master folder was passed
        const targetFolderId = (requestedFolderId && requestedFolderId !== MASTER_FOLDER_ID)
            ? requestedFolderId
            : userRootFolderId;

        const busboy = Busboy({ headers: req.headers });
        const uploadedFiles = [];

        busboy.on('file', async (fieldname, file, info) => {
            const { filename, mimeType } = info;
            const tmpFilePath = path.join(os.tmpdir(), filename);
            const writeStream = fs.createWriteStream(tmpFilePath);

            file.pipe(writeStream);

            writeStream.on('finish', async () => {
                try {
                    const fileMetadata = {
                        name: filename,
                        parents: [targetFolderId]
                    };

                    const media = {
                        mimeType: mimeType,
                        body: fs.createReadStream(tmpFilePath)
                    };

                    const response = await drive.files.create({
                        resource: fileMetadata,
                        media: media,
                        fields: 'id, name, mimeType, webViewLink, createdTime, size'
                    });

                    uploadedFiles.push(response.data);
                    fs.unlinkSync(tmpFilePath);
                } catch (error) {
                    console.error('Upload error:', error);
                }
            });
        });

        busboy.on('finish', () => {
            res.json({ files: uploadedFiles });
        });

        req.pipe(busboy);
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List Files - User Isolated
app.get('/listFiles', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization required' });
        }

        const drive = await getDriveClient();
        const token = authHeader.split('Bearer ')[1];
        const folderName = `User_${token.substring(0, 10)}`;

        // Get user's root folder
        const searchResponse = await drive.files.list({
            q: `name='${folderName}' and '${MASTER_FOLDER_ID}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
            fields: 'files(id, name)',
            pageSize: 1
        });

        if (!searchResponse.data.files || searchResponse.data.files.length === 0) {
            return res.json({ files: [], currentFolderId: null, rootFolderId: null });
        }

        const userRootFolderId = searchResponse.data.files[0].id;
        const requestedFolderId = req.query.folderId;

        // SECURITY: Never allow access to master folder or other user folders
        // Always use user's root folder if no folder specified or if master folder requested
        const folderId = (requestedFolderId && requestedFolderId !== MASTER_FOLDER_ID)
            ? requestedFolderId
            : userRootFolderId;

        const view = req.query.view || 'my-files';
        const sortField = req.query.sortField || 'name';
        const sortOrder = req.query.sortOrder || 'asc';

        let query = `'${folderId}' in parents and trashed=false`;

        if (view === 'trash') {
            query = `'${userRootFolderId}' in parents and trashed=true`;
        } else if (view === 'recent') {
            query = `'${userRootFolderId}' in parents and trashed=false`;
        }

        const orderByMap = {
            'name': 'name',
            'createdTime': 'createdTime',
            'size': 'quotaBytesUsed'
        };

        const response = await drive.files.list({
            q: query,
            fields: 'files(id, name, mimeType, webViewLink, thumbnailLink, size, createdTime, trashed)',
            orderBy: `${orderByMap[sortField] || 'name'} ${sortOrder}`,
            pageSize: 100
        });

        res.json({
            files: response.data.files || [],
            currentFolderId: folderId,
            rootFolderId: userRootFolderId
        });
    } catch (error) {
        console.error('List files error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create Folder - User Isolated
app.post('/createFolder', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization required' });
        }

        const { name, parentId } = req.body;
        const drive = await getDriveClient();
        const token = authHeader.split('Bearer ')[1];
        const folderName = `User_${token.substring(0, 10)}`;

        // Get user's root folder
        const searchResponse = await drive.files.list({
            q: `name='${folderName}' and '${MASTER_FOLDER_ID}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
            fields: 'files(id, name)',
            pageSize: 1
        });

        if (!searchResponse.data.files || searchResponse.data.files.length === 0) {
            return res.status(400).json({ error: 'User folder not found. Please refresh the page.' });
        }

        const userRootFolderId = searchResponse.data.files[0].id;

        // Use user's root folder if no parent specified or if master folder was passed
        const actualParentId = (parentId && parentId !== MASTER_FOLDER_ID)
            ? parentId
            : userRootFolderId;

        const folderMetadata = {
            name: name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [actualParentId]
        };

        const folder = await drive.files.create({
            resource: folderMetadata,
            fields: 'id, name, mimeType, createdTime'
        });

        res.json(folder.data);
    } catch (error) {
        console.error('Create folder error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete Item (Move to Trash)
app.delete('/deleteItem', async (req, res) => {
    try {
        const fileId = req.query.fileId;
        const drive = await getDriveClient();

        await drive.files.update({
            fileId: fileId,
            resource: { trashed: true }
        });

        res.json({ message: 'Item moved to trash' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Restore Item
app.post('/restoreItem', async (req, res) => {
    try {
        const fileId = req.query.fileId;
        const drive = await getDriveClient();

        await drive.files.update({
            fileId: fileId,
            resource: { trashed: false }
        });

        res.json({ message: 'Item restored' });
    } catch (error) {
        console.error('Restore error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rename Item
app.post('/renameItem', async (req, res) => {
    try {
        const { fileId, newName } = req.body;
        const drive = await getDriveClient();

        const response = await drive.files.update({
            fileId: fileId,
            resource: { name: newName },
            fields: 'id, name'
        });

        res.json(response.data);
    } catch (error) {
        console.error('Rename error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'JNIS Data Backend is running' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;
