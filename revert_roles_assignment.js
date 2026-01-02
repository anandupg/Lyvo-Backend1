const mongoose = require('mongoose');
const Property = require('./src/property/models/Property');
const User = require('./src/user/model');
const dotenv = require('dotenv');

dotenv.config();

const revertChanges = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        // 1. Revert Seeker Account
        const seekerEmail = 'anandupganesh2026@mca.ajce.in';
        const seekerUser = await User.findOne({ email: seekerEmail });

        if (seekerUser) {
            seekerUser.role = 1; // Revert to Seeker
            await seekerUser.save();
            console.log(`Reverted result: ${seekerUser.email} is now Role 1 (Seeker)`);
        } else {
            console.log(`Seeker user ${seekerEmail} not found`);
        }

        // 2. Find Correct Owner Account
        const ownerEmail = 'anandupg2022@gmail.com';
        const ownerUser = await User.findOne({ email: ownerEmail });

        if (!ownerUser) {
            console.log(`Owner user ${ownerEmail} not found!`);
            return;
        }
        console.log(`Found Correct Owner: ${ownerUser.email} (ID: ${ownerUser._id})`);

        // 3. Re-assign Property
        const property = await Property.findOne({ property_name: 'St Georges' });
        if (property) {
            property.owner_id = ownerUser._id;
            await property.save();
            console.log(`SUCCESS: Re-assigned "St Georges" to correct owner ${ownerUser.email}`);
        } else {
            console.log('Property "St Georges" not found');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
};

revertChanges();
