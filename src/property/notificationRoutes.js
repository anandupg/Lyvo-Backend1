const express = require('express');
const router = express.Router();
const Notification = require('./models/Notification');
const NotificationService = require('./services/notificationService'); // Adjust path
const { authMiddleware: authenticateUser } = require('../middleware/auth'); // Adjust path

// Get all notifications for user
router.get('/', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20, type } = req.query;

        const query = { recipient_id: userId };
        if (type) query.type = type;

        console.log(`🔍 Fetching notifications for user: ${userId}, query:`, query);

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await Notification.countDocuments(query);
        const unread = await Notification.countDocuments({ ...query, is_read: false });

        console.log(`✅ Found ${notifications.length} notifications, ${unread} unread`);

        res.json({
            success: true,
            data: notifications,
            pagination: {
                current: Number(page),
                total: Math.ceil(total / limit),
                totalRecords: total
            },
            unreadCount: unread
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get unread count
router.get('/unread-count', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const count = await Notification.countDocuments({
            recipient_id: userId,
            is_read: false
        });

        res.json({ success: true, count });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Mark as read
router.put('/:id/read', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const notification = await Notification.findOneAndUpdate(
            { _id: id, recipient_id: userId },
            { is_read: true, read_at: new Date() },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({ success: true, data: notification });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Mark all as read
router.put('/mark-all-read', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;

        await Notification.updateMany(
            { recipient_id: userId, is_read: false },
            { is_read: true, read_at: new Date() }
        );

        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete notification
router.delete('/:id', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const notification = await Notification.findOneAndDelete({
            _id: id,
            recipient_id: userId
        });

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Create notification (Manual/Dev)
router.post('/create', authenticateUser, async (req, res) => {
    try {
        // Maybe restrict to admin?
        // if (req.user.role !== 'admin') ...

        const notification = await NotificationService.createNotification(req.body);
        res.json({ success: true, data: notification });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Expense Reminder Route

module.exports = router;
