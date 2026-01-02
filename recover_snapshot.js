const mongoose = require('mongoose');
const Booking = require('./src/property/models/Booking');
const User = require('./src/user/model');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

const recoverSnapshot = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const email = 'anandupganesh2026@mca.ajce.in';
        const user = await User.findOne({ email });

        if (!user) {
            console.log('User not found!');
            return;
        }

        // Find the most recent booking for this user
        const booking = await Booking.findOne({ userId: user._id }).sort({ createdAt: -1 });

        if (!booking) {
            console.log('No booking found');
        } else {
            console.log('Booking found:', booking._id);
            const snapshot = booking.userSnapshot;
            console.log('Snapshot:', JSON.stringify(snapshot, null, 2));
            fs.writeFileSync('snapshot_recovery.json', JSON.stringify(snapshot, null, 2));
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
};

recoverSnapshot();
