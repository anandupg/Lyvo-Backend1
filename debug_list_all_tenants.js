const mongoose = require('mongoose');
require('dotenv').config();

const listTenants = async () => {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lyvo';
        await mongoose.connect(mongoUri);
        console.log('Connected to DB');

        const Tenant = require('./src/property/models/Tenant');
        const Room = require('./src/property/models/Room');

        const tenants = await Tenant.find({});
        console.log(`Total Tenants in DB: ${tenants.length}`);

        tenants.forEach(t => {
            console.log(`- Tenant: ${t.userName} (Room: ${JSON.stringify(t.roomNumber)}, ID: ${t.roomId}, Status: ${t.status})`);
        });

        // Force update Room 1
        const room1 = await Room.findOne({ room_number: 1 });
        if (room1) {
            console.log(`Room 1 found. Current Capacity: ${room1.occupancy}. Setting to 4.`);
            room1.occupancy = 4;
            await room1.save();
            console.log('Room 1 Capacity updated to 4.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

listTenants();
