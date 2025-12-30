const admin = require('../config/firebase-admin');

/**
 * Middleware to verify Firebase ID Token
 * Decodes the token and attaches the Firebase user to req.firebaseUser
 */
const firebaseAuthMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                message: 'Access denied. No token provided.',
                error: 'MISSING_TOKEN'
            });
        }

        const idToken = authHeader.split('Bearer ')[1];

        if (!idToken) {
            return res.status(401).json({
                message: 'Access denied. Token is empty.',
                error: 'EMPTY_TOKEN'
            });
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.firebaseUser = decodedToken;
        next();
    } catch (error) {
        console.error('Firebase Auth Error:', error);

        let errorMessage = 'Invalid token';
        if (error.code === 'auth/id-token-expired') {
            errorMessage = 'Token expired';
        } else if (error.code === 'auth/argument-error') {
            errorMessage = 'Invalid token format';
        }

        return res.status(401).json({
            message: 'Authentication failed: ' + errorMessage,
            error: 'INVALID_TOKEN'
        });
    }
};

module.exports = firebaseAuthMiddleware;
