
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

async function checkNotifications() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const Notification = mongoose.model('Notification', new mongoose.Schema({}, { strict: false }));
        const Property = mongoose.model('Property', new mongoose.Schema({}, { strict: false }));

        const lastNotifications = await Notification.find().sort({ createdAt: -1 }).limit(10).lean();
        const property = await Property.findOne().lean();

        const output = {
            lastNotifications: lastNotifications.map(n => ({
                id: n._id,
                recipient_id: n.recipient_id,
                recipient_id_type: typeof n.recipient_id,
                title: n.title,
                type: n.type,
                is_read: n.is_read,
                createdAt: n.createdAt
            })),
            sampleProperty: property ? {
                name: property.property_name,
                owner_id: property.owner_id,
                owner_id_type: typeof property.owner_id
            } : null
        };

        fs.writeFileSync('diagnostic_output.json', JSON.stringify(output, null, 2));
        console.log('Results written to diagnostic_output.json');

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkNotifications();
