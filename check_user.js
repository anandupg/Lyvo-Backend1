
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

async function checkUser() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

        const userId = "6944ebfaccd01fda432f0dad";
        const user = await User.findById(userId).lean();

        const output = {
            targetUserId: userId,
            userFound: !!user,
            userData: user ? {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive
            } : null
        };

        fs.writeFileSync('user_diagnostic.json', JSON.stringify(output, null, 2));
        console.log('Results written to user_diagnostic.json');

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkUser();
