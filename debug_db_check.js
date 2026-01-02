require('dotenv').config();
const mongoose = require('mongoose');

const checkDB = async () => {
    try {
        console.log('MONGO_URI from env:', process.env.MONGO_URI);

        if (!process.env.MONGO_URI) {
            console.log('No MONGO_URI found in .env');
            return;
        }

        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('\nCollections:');
        collections.forEach(c => console.log(' -', c.name));

        const Room = require('./src/property/models/Room');
        const count = await Room.countDocuments();
        console.log('\nRoom Count via Mongoose:', count);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        // await mongoose.disconnect(); // Keep open for a sec to flush?
        process.exit();
    }
};

checkDB();
