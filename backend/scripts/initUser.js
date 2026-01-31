const admin = require("firebase-admin");
const { google } = require("googleapis");
const path = require("path");
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// --- CONFIGURATION ---
const USER_ID = process.argv[2];
const USER_EMAIL = process.argv[3] || "user@example.com";
const MASTER_FOLDER_ID = process.env.MASTER_FOLDER_ID;
const EMULATOR_HOST = "127.0.0.1:9000";

// OAUTH CONFIG
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

if (!USER_ID || !MASTER_FOLDER_ID) {
    console.error("Usage: node initUser.js <USER_UID> <USER_EMAIL>");
    process.exit(1);
}

// FORCE EMULATOR FOR DB
process.env.FIREBASE_DATABASE_EMULATOR_HOST = EMULATOR_HOST;

admin.initializeApp({
    projectId: "jnis-cloud-project",
    databaseURL: `http://${EMULATOR_HOST}/?ns=jnis-cloud-project`
});

async function main() {
    console.log(`Initializing folder for User: ${USER_ID}...`);

    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
        console.error("Error: Missing OAuth Credentials in .env");
        process.exit(1);
    }

    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, "https://developers.google.com/oauthplayground");
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    try {
        const fileMetadata = {
            name: `${USER_EMAIL}_Vault`,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [MASTER_FOLDER_ID]
        };
        const file = await drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        });
        console.log(`Created Drive Folder: ${file.data.id}`);

        const db = admin.database();
        await db.ref(`users/${USER_ID}`).update({
            email: USER_EMAIL,
            driveFolderId: file.data.id,
            driveFolderCreatedAt: admin.database.ServerValue.TIMESTAMP
        });
        console.log("Database Updated Successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}
main();
