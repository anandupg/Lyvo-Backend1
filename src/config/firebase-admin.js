const admin = require("firebase-admin");

if (
    !process.env.FIREBASE_PROJECT_ID ||
    !process.env.FIREBASE_CLIENT_EMAIL ||
    !process.env.FIREBASE_PRIVATE_KEY
) {
    console.warn("⚠️ Firebase Admin Environment Variables missing");
} else {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                project_id: process.env.FIREBASE_PROJECT_ID,
                client_email: process.env.FIREBASE_CLIENT_EMAIL,
                private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
            }),
        });
        console.log("✅ Firebase Admin initialized");
    } catch (err) {
        console.error("❌ Firebase Admin Initialization Error:", err);
    }
}

module.exports = admin;
