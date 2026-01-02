const mongoose = require('mongoose');
const Property = require('./src/property/models/Property');
const dotenv = require('dotenv');

dotenv.config();

const debugQuery = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const targetId = '6944ebfaccd01fda432f0dad';
        console.log(`Testing query for ID: ${targetId}`);

        // 1. String Query
        const stringQuery = await Property.find({ owner_id: targetId });
        console.log(`String Query result count: ${stringQuery.length}`);

        // 2. ObjectId Query
        const objectId = new mongoose.Types.ObjectId(targetId);
        const objectIdQuery = await Property.find({ owner_id: objectId });
        console.log(`ObjectId Query result count: ${objectIdQuery.length}`);

        if (stringQuery.length === 0 && objectIdQuery.length === 0) {
            console.log('BOTH queries failed. Dumping all properties owner_ids:');
            const allProps = await Property.find({});
            allProps.forEach(p => {
                console.log(`- Prop: ${p._id}, Owner: ${p.owner_id} (${typeof p.owner_id}), Constructor: ${p.owner_id.constructor.name}`);
                console.log(`  Equals target ObjectId? ${p.owner_id.equals(objectId)}`);
                console.log(`  String match? ${p.owner_id.toString() === targetId}`);
            });
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
};

debugQuery();
