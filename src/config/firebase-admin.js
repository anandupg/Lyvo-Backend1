const admin = require('firebase-admin');
try {
    const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Replace escaped newlines if they exist in the env var
        privateKey: process.env.FIREBASE_PRIVATE_KEY
            ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            : undefined
    };

    if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
        console.warn('⚠️ Firebase Admin Environment Variables missing. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin Initialized successfully.');
} catch (error) {
    if (!/already exists/.test(error.message)) {
        console.error('❌ Firebase Admin Initialization Error:', error.stack);
    }
}

module.exports = admin;
