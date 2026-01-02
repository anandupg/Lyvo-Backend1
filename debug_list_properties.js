const mongoose = require('mongoose');
const User = require('./src/user/model');
const Property = require('./src/property/models/Property');
const dotenv = require('dotenv');
const fs = require('fs');
const util = require('util');

dotenv.config();

const logFile = fs.createWriteStream('debug_properties_output.txt', { flags: 'w' });
const logStdout = process.stdout;

console.log = function (d) {
    logFile.write(util.format(d) + '\n');
    logStdout.write(util.format(d) + '\n');
};

const debugProperties = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        console.log('\n--- USERS ---');
        const users = await User.find({}).select('name email role _id');
        console.log(`Found ${users.length} users.`);

        users.forEach(u => {
            console.log(`User: ${u.name} | Email: ${u.email} | Role: ${u.role} | ID: ${u._id}`);
        });

        console.log('\n--- PROPERTIES ---');
        const properties = await Property.find({});
        console.log(`Found ${properties.length} properties.`);

        if (properties.length === 0) {
            console.log('No properties found in DB.');
        } else {
            properties.forEach(p => {
                console.log(`Property: ${p.property_name} | Status: ${p.status} | OwnerID: ${p.owner_id} (${typeof p.owner_id})`);
            });
        }

    } catch (err) {
        console.error('Error:', err);
        logFile.write('Error: ' + util.format(err) + '\n');
    } finally {
        await mongoose.disconnect();
        // Give time for buffer to flush
        setTimeout(() => {
            logFile.end();
            process.exit(0);
        }, 1000);
    }
};

debugProperties();
