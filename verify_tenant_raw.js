const mongoose = require('mongoose');
require('dotenv').config();

const dumpTenants = async () => {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lyvo';
        await mongoose.connect(mongoUri);

        const Tenant = require('./src/property/models/Tenant');
        const tenants = await Tenant.find({});
        console.log(JSON.stringify(tenants, null, 2));

    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
};

dumpTenants();
