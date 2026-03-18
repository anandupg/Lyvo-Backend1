const MaintenanceRequest = require('./model');
const Notification = require('../property/models/Notification');
const Tenant = require('../property/models/Tenant');
const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

async function getPredictedPriority(title, description, category) {
    try {
        const response = await axios.post(
            `${ML_SERVICE_URL}/predict_priority`,
            { title, description, category },
            { timeout: 3000 }
        );
        if (response.data.success) {
            return { priority: response.data.priority, confidence: response.data.confidence };
        }
    } catch (_) {
        // ML service unavailable — silently fall back
    }
    return null;
}

exports.createRequest = async (req, res) => {
    try {
        const { title, category, description, images } = req.body;
        // If tenant explicitly sent a non-default priority, honour it (manual).
        // If omitted or 'medium' (the default), run auto-classification.
        const manualPriority = req.body.priority;
        const tenantId = req.user.id;

        // Find tenant details to get owner and property info
        const tenant = await Tenant.findOne({ userId: tenantId, status: 'active' });
        if (!tenant) {
            console.log('Maintenance Create: No active tenant found for userId:', tenantId);
            return res.status(404).json({ message: 'No active tenancy found. You must be an active tenant to submit requests.' });
        }

        // Determine priority and its source
        let priority = manualPriority || 'medium';
        let prioritySource = 'manual';

        if (!manualPriority || manualPriority === 'medium') {
            const prediction = await getPredictedPriority(title, description, category);
            if (prediction) {
                priority = prediction.priority;
                prioritySource = 'auto';
            }
        }

        const maintenanceRequest = new MaintenanceRequest({
            tenantId,
            ownerId: tenant.ownerId,
            propertyId: tenant.propertyId,
            roomId: tenant.roomId,
            title,
            category,
            priority,
            prioritySource,
            description,
            images
        });

        await maintenanceRequest.save();

        // Create Notification for Owner
        const notification = new Notification({
            recipient_id: tenant.ownerId.toString(),
            recipient_type: 'owner',
            title: 'New Maintenance Request',
            message: `New ${priority} priority request: ${title} from ${tenant.userName}`,
            type: 'maintenance_request',
            metadata: { maintenanceRequestId: maintenanceRequest._id },
            action_url: '/owner/maintenance'
        });
        await notification.save();

        // Emit Real-time Notification
        // socket room is strictly 'user_' + userId
        if (global.io) {
            const roomName = `user_${tenant.ownerId.toString()}`;
            global.io.to(roomName).emit('new_notification', notification);

            // Also emit specifically to notification listener channel if needed (usually handled by listener listening to new_notification)
            global.io.to(roomName).emit('send_notification', {
                recipientId: tenant.ownerId,
                title: notification.title,
                message: notification.message
            });
        }

        res.status(201).json(maintenanceRequest);
    } catch (error) {
        console.error('Error creating maintenance request:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getTenantRequests = async (req, res) => {
    try {
        const requests = await MaintenanceRequest.find({ tenantId: req.user.id })
            .sort({ createdAt: -1 });
        res.json(requests);
    } catch (error) {
        console.error('Error fetching tenant requests:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getOwnerRequests = async (req, res) => {
    try {
        // Allow Admin (role 2) to see all requests or similar? 
        // For now, implementing Owner specific. Access usually restricted to Owner role by route.
        // If Admin needs checks, assume Owner requests route is for Owner.
        const requests = await MaintenanceRequest.find({ ownerId: req.user.id })
            .populate('tenantId', 'name email phone')
            .populate('roomId', 'room_number')
            .populate('propertyId', 'property_name')
            .sort({ createdAt: -1 });
        res.json(requests);
    } catch (error) {
        console.error('Error fetching owner requests:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateRequestStatus = async (req, res) => {
    try {
        const { status, assignedTo } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role; // 1=Seeker, 2=Admin, 3=Owner

        let request;
        let recipientId;
        let notifMessage;
        let notifType = 'seeker';
        let actionUrl = '/tenant/maintenance';

        // 1. Owner or Admin update
        if (userRole === 3 || userRole === 2) {
            const query = { _id: req.params.id };
            // If Owner, restrict to their requests
            if (userRole === 3) query.ownerId = userId;

            request = await MaintenanceRequest.findOneAndUpdate(
                query,
                { status, assignedTo },
                { new: true }
            );

            if (!request) return res.status(404).json({ message: 'Request not found' });

            recipientId = request.tenantId;
            notifMessage = `Your maintenance request "${request.title}" is now ${status}`;
        }
        // 2. Tenant Cancellation
        else if (userRole === 1) {
            if (status !== 'cancelled') {
                return res.status(403).json({ message: 'Tenants can only cancel requests.' });
            }
            request = await MaintenanceRequest.findOneAndUpdate(
                { _id: req.params.id, tenantId: userId, status: 'pending' },
                { status: 'cancelled' },
                { new: true }
            );

            if (!request) return res.status(404).json({ message: 'Request not found or not pending.' });

            recipientId = request.ownerId;
            notifType = 'owner';
            actionUrl = '/owner/maintenance';
            notifMessage = `Tenant cancelled maintenance request: "${request.title}"`;
        } else {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        // Notify Recipient (Tenant if Owner updated, Owner if Tenant cancelled)
        const notification = new Notification({
            recipient_id: recipientId.toString(),
            recipient_type: notifType,
            title: 'Maintenance Update',
            message: notifMessage,
            type: 'maintenance_request',
            metadata: { maintenanceRequestId: request._id },
            action_url: actionUrl
        });
        await notification.save();

        if (global.io) {
            const roomName = `user_${recipientId.toString()}`;
            global.io.to(roomName).emit('new_notification', notification);
        }

        res.json(request);
    } catch (error) {
        console.error('Error updating request:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Proxy: frontend calls this to get an AI priority suggestion before submitting
exports.suggestPriority = async (req, res) => {
    const { title, description, category } = req.body;
    const prediction = await getPredictedPriority(title || '', description || '', category || '');
    if (prediction) {
        return res.json({ success: true, priority: prediction.priority, confidence: prediction.confidence });
    }
    // ML service down — return neutral fallback so frontend can still work
    res.json({ success: false, priority: 'medium', confidence: 0 });
};
