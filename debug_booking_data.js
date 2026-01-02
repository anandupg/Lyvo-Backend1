const mongoose = require('mongoose');
const Booking = require('./src/property/models/Booking'); // Adjust path if needed
const User = require('./src/user/model');
const { AadharDetails } = require('./src/user/model');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const debugBooking = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const email = 'anandupganesh2026@mca.ajce.in';
        const user = await User.findOne({ email });

        if (!user) {
            console.log('User not found:', email);
            return;
        }
        console.log('User found:', user._id, user.name);

        // Find a booking for this user
        // Assuming Booking model is in src/property/model or similar. 
        // Let's guess the path based on previous `controller.js` imports, usually it's imported there.
        // Checking previous logs... `Booking` model path wasn't explicitly shown but `controller.js` uses it.
        // I'll try to require it from `src/property/model` which is standard in this project structure if not root.
        // Wait, controller.js usually imports likely `../models/booking` or `./model`.
        // I will try generic traverse or just look for the file first.

        // Actually, let's just use the User and AadharDetails first to confirm KYC exists for this ID.

        const kyc = await AadharDetails.findOne({ userId: user._id, approvalStatus: 'approved' });
        console.log('KYC Record:', kyc ? {
            id: kyc._id,
            status: kyc.approvalStatus,
            hasFrontImage: !!kyc.frontImageUrl,
            frontImageUrl: kyc.frontImageUrl,
            address: kyc.extractedData?.address
        } : 'No Approved KYC Found');

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
};

debugBooking();
