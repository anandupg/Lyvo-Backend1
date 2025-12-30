const admin = require('firebase-admin');
const serviceAccount = require('./firebaseServiceAccount.json');

try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin Initialized successfully.');
} catch (error) {
    if (!/already exists/.test(error.message)) {
        console.error('Firebase Admin Initialization Error:', error.stack);
    }
}

module.exports = admin;
