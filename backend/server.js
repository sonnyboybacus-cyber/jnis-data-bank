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

// Initialize User - Create Google Drive Folder
app.post('/api/initialize', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }

        const drive = await getDriveClient();

        // Create user folder
        const folderMetadata = {
            name: `User_${userId}`,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [MASTER_FOLDER_ID]
        };

        const folder = await drive.files.create({
            resource: folderMetadata,
            fields: 'id, name'
        });

        res.json({ folderId: folder.data.id, message: 'User initialized successfully' });
    } catch (error) {
        console.error('Initialize error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Upload File
app.post('/api/upload', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }

        const busboy = Busboy({ headers: req.headers });
        const drive = await getDriveClient();
        const uploadedFiles = [];

        busboy.on('file', async (fieldname, file, info) => {
            const { filename, encoding, mimeType } = info;
            const tmpFilePath = path.join(os.tmpdir(), filename);
            const writeStream = fs.createWriteStream(tmpFilePath);

            file.pipe(writeStream);

            writeStream.on('finish', async () => {
                try {
                    const folderId = req.headers['x-folder-id'] || MASTER_FOLDER_ID;

                    const fileMetadata = {
                        name: filename,
                        parents: [folderId]
                    };

                    const media = {
                        mimeType: mimeType,
                        body: fs.createReadStream(tmpFilePath)
                    };

                    const response = await drive.files.create({
                        resource: fileMetadata,
                        media: media,
                        fields: 'id, name, mimeType, webViewLink'
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

// List Files
app.get('/api/files', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }

        const drive = await getDriveClient();
        const folderId = req.query.folderId || MASTER_FOLDER_ID;
        const view = req.query.view || 'my-files';
        const sortBy = req.query.sortBy || 'name';
        const order = req.query.order || 'asc';

        let query = `'${folderId}' in parents and trashed=false`;

        if (view === 'trash') {
            query = `trashed=true`;
        } else if (view === 'recent') {
            query = `trashed=false`;
        }

        const orderByMap = {
            'name': 'name',
            'createdTime': 'createdTime',
            'size': 'quotaBytesUsed'
        };

        const response = await drive.files.list({
            q: query,
            fields: 'files(id, name, mimeType, webViewLink, thumbnailLink, size, createdTime, trashed)',
            orderBy: `${orderByMap[sortBy]} ${order}`,
            pageSize: 100
        });

        res.json({ files: response.data.files || [] });
    } catch (error) {
        console.error('List files error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create Folder
app.post('/api/create-folder', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }

        const { name, parentId } = req.body;
        const drive = await getDriveClient();

        const folderMetadata = {
            name: name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId || MASTER_FOLDER_ID]
        };

        const folder = await drive.files.create({
            resource: folderMetadata,
            fields: 'id, name, mimeType'
        });

        res.json(folder.data);
    } catch (error) {
        console.error('Create folder error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete File (Move to Trash)
app.delete('/api/files/:fileId', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }

        const drive = await getDriveClient();
        await drive.files.update({
            fileId: req.params.fileId,
            resource: { trashed: true }
        });

        res.json({ message: 'File moved to trash' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Restore File
app.post('/api/files/:fileId/restore', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }

        const drive = await getDriveClient();
        await drive.files.update({
            fileId: req.params.fileId,
            resource: { trashed: false }
        });

        res.json({ message: 'File restored' });
    } catch (error) {
        console.error('Restore error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rename File
app.patch('/api/files/:fileId', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }

        const { name } = req.body;
        const drive = await getDriveClient();

        const response = await drive.files.update({
            fileId: req.params.fileId,
            resource: { name },
            fields: 'id, name'
        });

        res.json(response.data);
    } catch (error) {
        console.error('Rename error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'JNIS Data Backend is running' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;
