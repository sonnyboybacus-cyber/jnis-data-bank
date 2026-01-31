/* eslint-disable */
const { google } = require('googleapis');
const readline = require('readline');

// Create interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("\n--- Google Drive OAuth 2.0 Setup ---\n");
console.log("1. Go to Google Cloud Console > APIs & Services > Credentials");
console.log("2. Create Credentials > OAuth Client ID > Desktop App");
console.log("3. Copy the Client ID and Client Secret below.\n");

rl.question('Enter your Client ID: ', (clientId) => {
    rl.question('Enter your Client Secret: ', (clientSecret) => {

        // Create OAuth2 client
        // We use 'urn:ietf:wg:oauth:2.0:oob' which is standard for manual copy-paste flow
        // If this fails, try using 'http://localhost' and copy the code from the URL bar on failure
        const oauth2Client = new google.auth.OAuth2(
            clientId,
            clientSecret,
            'urn:ietf:wg:oauth:2.0:oob'
        );

        // Generate the url that will be used for authorization
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline', // Crucial for getting a Refresh Token
            scope: ['https://www.googleapis.com/auth/drive'],
        });

        console.log('\nAuthorize this app by visiting this url:\n', authUrl);

        rl.question('\nEnter the code from that page here: ', (code) => {
            rl.close();

            // Exchange code for tokens
            oauth2Client.getToken(code, (err, token) => {
                if (err) return console.error('Error retrieving access token', err);

                console.log('\n--- SUCCESS! Add these to your .env file ---\n');
                console.log(`GOOGLE_CLIENT_ID=${clientId}`);
                console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
                console.log(`GOOGLE_REFRESH_TOKEN=${token.refresh_token}`);
                console.log('\n----------------------------------------------\n');
            });
        });
    });
});
