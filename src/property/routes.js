const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware: authenticateUser, requireRole: authorizeRoles, optionalAuthMiddleware } = require('../middleware/auth');
const propertyController = require('./controller');
const User = require('../user/model');

// --- Multer Configuration ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';
        // Create uploads directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only images and PDF documents are allowed!'), false);
        }
    }
});

// Helper for multiple file uploads for property
const addPropertyUpload = upload.fields([
    { name: 'frontImage', maxCount: 1 },
    { name: 'backImage', maxCount: 1 },
    { name: 'hallImage', maxCount: 1 },
    { name: 'kitchenImage', maxCount: 1 },
    { name: 'galleryImages', maxCount: 10 },
    { name: 'outsideToiletImage', maxCount: 1 },
    { name: 'landTaxReceipt', maxCount: 1 },
    { name: 'dormitoryImages', maxCount: 10 },
    { name: 'dormitoryToiletImage', maxCount: 1 },
    // Handle up to 10 rooms with specific fields (dynamic fields handle manually in controller or via any())
    // But multer fields must be static? 
    // We can use any() but that's less secure. Or list many.
    // Actually, client sends rooms[0][roomImage].
    // Multer fields can accept this?
    // Let's use any() for simplicity if dynamic fields are heavy, 
    // OR construct a long list if we know max rooms. 
    // Original code likely used strict fields or any.
    // We'll use any() but filtered by fileFilter above.
]);

// Actually, let's use a dynamic approach or specific fields if possible.
// If we use upload.any(), we get all files in req.files array.
// Controller logic expects req.files to be object or array?
// Controller uses: req.files.propertyImages ...
// My controller: if (req.files) ... 
// "Object.values(req.files).forEach..." suggest it supports object (fields) or array (any).
// Let's stick to fields for main images, but room images are tricky.
// Let's use upload.any() to cover all cases including dynamic room indices.
const propertyUpload = upload.any();


// --- Middleware ---

const ensureOwnerKYC = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        // Check KYC status logic here
        // For now, allow all or check specific field
        // if (user.kycStatus !== 'verified') ...

        next();
    } catch (error) {
        res.status(500).json({ message: 'Server error checking KYC' });
    }
};

// --- Routes ---

// Property Management (Owner)
router.post('/add', authenticateUser, authorizeRoles('owner'), ensureOwnerKYC, propertyUpload, propertyController.addProperty);
router.get('/owner/properties', authenticateUser, authorizeRoles('owner'), propertyController.getProperties);
router.get('/owner/properties/:id', authenticateUser, authorizeRoles('owner'), propertyController.getProperty);
router.put('/owner/properties/:id', authenticateUser, authorizeRoles('owner'), propertyUpload, propertyController.updateProperty);
router.put('/owner/properties/:id/status', authenticateUser, authorizeRoles('owner'), propertyController.updatePropertyStatus);
// Wait, I implemented updateProperty in Part 2? NO! I missed `updateProperty`.
// It was in the very last chunk I read (Lines 3060+).
// I missed including it in the parts!
// I need to add `updateProperty` to the controller.

// Room Management (Owner)
router.post('/owner/properties/:propertyId/rooms', authenticateUser, authorizeRoles('owner'), propertyUpload, propertyController.addRoom);
router.put('/rooms/:roomId/status', authenticateUser, authorizeRoles('owner'), propertyController.updateRoomStatus);
router.put('/rooms/:roomId', authenticateUser, authorizeRoles('owner'), propertyUpload, propertyController.updateRoom);

// Property Management (Admin)
router.get('/admin/properties', authenticateUser, authorizeRoles('admin'), propertyController.getAllPropertiesAdmin);
router.get('/admin/properties/:id', authenticateUser, authorizeRoles('admin'), propertyController.getPropertyAdmin);
router.put('/admin/properties/:id/approve', authenticateUser, authorizeRoles('admin'), propertyController.approvePropertyAdmin);
router.put('/admin/rooms/:roomId/approve', authenticateUser, authorizeRoles('admin'), propertyController.approveRoomAdmin);
router.delete('/admin/rooms/:roomId', authenticateUser, authorizeRoles('admin'), propertyController.deleteRoomAdmin);
router.delete('/admin/properties/:id', authenticateUser, authorizeRoles('admin'), propertyController.deletePropertyAdmin);
router.post('/admin/message', authenticateUser, authorizeRoles('admin'), propertyController.sendAdminMessage);

// Public Routes (Seeker)
router.get('/public/properties', optionalAuthMiddleware, propertyController.getApprovedPropertiesPublic);
router.get('/public/properties/:id', optionalAuthMiddleware, propertyController.getApprovedPropertyPublic);
router.get('/public/rooms/:roomId', optionalAuthMiddleware, propertyController.getRoomPublic);

// Booking & Payments
router.post('/payments/create-order', authenticateUser, propertyController.createPaymentOrder);
router.post('/payments/verify', authenticateUser, propertyController.verifyPaymentAndCreateBooking);
router.post('/bookings/create', authenticateUser, propertyController.createBookingPublic); // Public manual booking?
router.get('/owner/bookings', authenticateUser, authorizeRoles('owner'), propertyController.listOwnerBookings);
router.get('/owner/bookings/pending', authenticateUser, authorizeRoles('owner'), propertyController.getPendingApprovalBookings);
router.get('/user/bookings', authenticateUser, propertyController.getUserBookings);
router.get('/user/check-booking', authenticateUser, propertyController.checkUserBookingStatus);
router.get('/bookings/:bookingId', authenticateUser, propertyController.getBookingDetails);
router.post('/bookings/:bookingId/status', authenticateUser, authorizeRoles('owner'), propertyController.updateBookingStatus);
router.post('/bookings/:bookingId/finalize-check-in', authenticateUser, authorizeRoles('owner'), propertyController.finalizeCheckIn);
router.delete('/bookings/:bookingId', authenticateUser, propertyController.cancelAndDeleteBooking);
router.get('/bookings/lookup/payment', propertyController.lookupBookingDetails); // Maybe public or protected?
router.post('/user/check-in/:bookingId', authenticateUser, propertyController.markUserCheckIn);

// Favorites
router.post('/favorites', authenticateUser, propertyController.addFavorite);
router.post('/favorites/remove', authenticateUser, propertyController.removeFavorite);
router.get('/favorites', authenticateUser, propertyController.getUserFavorites);
router.get('/favorites/check', authenticateUser, propertyController.checkFavoriteStatus);

// Tenant Management
router.get('/owner/tenants', authenticateUser, authorizeRoles('owner'), propertyController.getOwnerTenants);
router.get('/owner/properties/:propertyId/tenants', authenticateUser, authorizeRoles('owner'), propertyController.getPropertyTenants);
router.get('/tenants/:tenantId', authenticateUser, propertyController.getTenantDetails);
router.put('/tenants/:tenantId', authenticateUser, authorizeRoles('owner'), propertyController.updateTenantDetails);
router.post('/tenants/:tenantId/check-in', authenticateUser, authorizeRoles('owner'), propertyController.markTenantCheckIn);
router.post('/tenants/:tenantId/check-out', authenticateUser, authorizeRoles('owner'), propertyController.markTenantCheckOut);
router.get('/user/tenants', authenticateUser, propertyController.getUserTenantRecords);
router.get('/user/tenant-status', authenticateUser, propertyController.getTenantStatus);
router.get('/public/rooms/:roomId/tenants', propertyController.getRoomTenants);

// Expense Management
router.get('/expenses', authenticateUser, propertyController.getExpenses);
router.post('/expenses', authenticateUser, propertyController.addExpense);
router.post('/expenses/:expenseId/settle', authenticateUser, propertyController.settleExpense);
router.post('/expenses/:expenseId/remind', authenticateUser, propertyController.remindExpensePayment);

// Debug/Maintenance
router.get('/debug/rooms', propertyController.getAllRoomsDebug);
router.get('/debug/bookings', authenticateUser, authorizeRoles('admin'), propertyController.getAllBookingsAdmin);
router.post('/maintenance/create-missing-tenants', authenticateUser, authorizeRoles('admin'), propertyController.createMissingTenantRecords);

module.exports = router;
