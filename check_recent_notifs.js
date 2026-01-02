
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

async function checkRecentNotifications() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const Notification = mongoose.model('Notification', new mongoose.Schema({}, { strict: false }));

        const ownerId = "6944ebfaccd01fda432f0dad";
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        const recentNotifs = await Notification.find({
            recipient_id: ownerId,
            createdAt: { $gte: fiveMinutesAgo }
        }).sort({ createdAt: -1 }).lean();

        const output = {
            ownerId,
            count: recentNotifs.length,
            notifications: recentNotifs.map(n => ({
                id: n._id,
                title: n.title,
                message: n.message,
                createdAt: n.createdAt,
                type: n.type
            }))
        };

        fs.writeFileSync('recent_notifs.json', JSON.stringify(output, null, 2));
        console.log('Results written to recent_notifs.json');

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkRecentNotifications();
