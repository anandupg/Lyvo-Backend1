const mongoose = require('mongoose');
const User = require('./src/user/model');
const { AadharDetails } = require('./src/user/model');
const dotenv = require('dotenv');

dotenv.config();

const checkUserData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const email = 'anandupganesh2026@mca.ajce.in';
        const user = await User.findOne({ email });

        if (!user) {
            console.log('User not found!');
            return;
        }

        console.log('User Data:', {
            id: user._id,
            name: user.name,
            email: user.email,
            gender: user.gender,
            occupation: user.occupation,
            location: user.location,
            profilePicture: user.profilePicture
        });

        const kyc = await AadharDetails.findOne({ userId: user._id });
        console.log('KYC Data:', kyc ? {
            status: kyc.approvalStatus,
            address: kyc.extractedData?.address
        } : 'No KYC Record');

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
};

checkUserData();
