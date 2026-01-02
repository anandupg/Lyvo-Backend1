const mongoose = require('mongoose');
const Property = require('./src/property/models/Property');
const User = require('./src/user/model');
const dotenv = require('dotenv');

dotenv.config();

const assignProperty = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        // 1. Find the target user (the one they are likely logged in as)
        // We suspect they are using this email based on previous seed data interaction
        const targetEmail = 'anandupganesh2026@mca.ajce.in';
        const targetUser = await User.findOne({ email: targetEmail });

        if (!targetUser) {
            console.log(`Target user ${targetEmail} not found!`);
            return;
        }

        console.log(`Found Target User: ${targetUser.name} (${targetUser.email})`);

        // Ensure they have Owner role (3)
        if (targetUser.role !== 3) {
            targetUser.role = 3;
            await targetUser.save();
            console.log('Updated user role to 3 (Owner)');
        }

        // 2. Find the Property
        const property = await Property.findOne({ property_name: 'St Georges' });
        if (!property) {
            console.log('Property "St Georges" not found!');
            return;
        }

        console.log(`Found Property: ${property.property_name}, Current Owner: ${property.owner_id}`);

        // 3. Assign Property to Target User
        property.owner_id = targetUser._id;
        await property.save();

        console.log(`SUCCESS: Assigned "St Georges" to ${targetUser.email} (ID: ${targetUser._id})`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
};

assignProperty();
