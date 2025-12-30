const express = require('express');
const router = express.Router();
const { getAllUsers, registerUser, verifyEmail, loginUser, forgotPassword, resetPassword, getUserProfile, updateUserProfile, changePassword, googleSignIn, uploadProfilePicture, upload, saveBehaviourAnswers, getBehaviourQuestions, getBehaviourStatus, uploadKycDocuments, adminReviewKyc, toggleUserStatus, checkEmailExists, resendVerificationEmail, getAadharStatus, requireAadharApproval, createAdmin } = require('./controller');
const { authMiddleware } = require('../middleware/auth');

// Public routes
router.post('/user/register', registerUser);
router.post('/user/login', loginUser);
router.post('/user/google-signin', googleSignIn);
router.post('/user/forgot-password', forgotPassword);
router.post('/user/reset-password', resetPassword);
router.get('/user/verify-email/:token', verifyEmail);
router.get('/user/check-email', checkEmailExists);
router.post('/user/resend-verification', resendVerificationEmail);

// Firebase Authentication Route (Replaces traditional login/register)
const firebaseAuthMiddleware = require('../middleware/firebaseAuth');
const { authWithFirebase } = require('./controller');
router.post('/user/auth/firebase', firebaseAuthMiddleware, authWithFirebase);

// Protected routes
router.get('/user/users', authMiddleware, getAllUsers);
router.get('/user/all', authMiddleware, getAllUsers); // Alias for getAllUsers
router.get('/user/profile/:userId', authMiddleware, getUserProfile);
router.put('/user/profile/:userId', authMiddleware, updateUserProfile);

// Public routes for service-to-service communication
router.get('/public/user/:userId', getUserProfile);
router.post('/user/change-password', authMiddleware, changePassword);
router.post('/user/upload-profile-picture', authMiddleware, upload.single('profilePicture'), uploadProfilePicture);
// KYC endpoints (accept front and back images)
router.post('/user/upload-kyc', authMiddleware, upload.fields([
    { name: 'frontImage', maxCount: 1 },
    { name: 'backImage', maxCount: 1 }
]), uploadKycDocuments);
router.post('/admin/kyc/review', authMiddleware, adminReviewKyc);

// Aadhar verification endpoints
router.get('/user/aadhar-status', authMiddleware, getAadharStatus);
// Admin user management
router.patch('/admin/user/:userId/toggle-status', authMiddleware, toggleUserStatus);
router.patch('/user/:userId/status', authMiddleware, toggleUserStatus); // Alias for toggling user status
router.post('/admin/create-admin', authMiddleware, createAdmin); // Create new admin
// Behaviour onboarding
router.get('/behaviour/questions', authMiddleware, getBehaviourQuestions);
router.post('/behaviour/answers', authMiddleware, saveBehaviourAnswers);
router.get('/behaviour/status', authMiddleware, getBehaviourStatus);

// Test authentication endpoint
router.get('/user/test-auth', authMiddleware, (req, res) => {
    res.json({
        message: 'Authentication successful',
        user: req.user,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
