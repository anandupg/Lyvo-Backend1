const mongoose = require('mongoose');
require('dotenv').config();

const verifyData = async () => {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lyvo';
        await mongoose.connect(mongoUri);
        console.log('Connected to DB');

        const Room = require('./src/property/models/Room');
        const Booking = require('./src/property/models/Booking');
        const Tenant = require('./src/maintenance/model'); // Tenant model is in maintenance/model.js based on previous checks

        const rooms = await Room.find({ status: 'active' });
        console.log(`Found ${rooms.length} active rooms.`);

        const data = [];
        for (const room of rooms) {
            const bookingCount = await Booking.countDocuments({
                roomId: room._id,
                status: { $in: ['confirmed', 'checked_in', 'approved', 'payment_completed'] },
                isDeleted: { $ne: true }
            });

            const tenantCount = await Tenant.countDocuments({
                roomId: room._id,
                status: 'active',
                isDeleted: { $ne: true }
            });

            data.push({
                roomNumber: room.room_number,
                id: room._id,
                occupancy: room.occupancy,
                bookings: bookingCount,
                tenants: tenantCount,
                isAvailable: room.is_available
            });
        }

        console.log(JSON.stringify(data, null, 2));
        const fs = require('fs');
        fs.writeFileSync('rooms_dump.json', JSON.stringify(data, null, 2));

    } catch (error) {
        console.error('Verification Failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

verifyData();
