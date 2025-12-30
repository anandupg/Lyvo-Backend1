const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./src/user/model');
const { AadharDetails } = require('./src/user/model');

async function debugKycStatus() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all users with approved KYC status
        const approvedUsers = await User.find({ kycStatus: 'approved' });
        console.log(`\nFound ${approvedUsers.length} users with approved KYC status:`);

        for (const user of approvedUsers) {
            console.log(`\n--- User: ${user.name} (${user.email}) ---`);
            console.log(`User ID: ${user._id}`);
            console.log(`KYC Status: ${user.kycStatus}`);
            console.log(`KYC Verified: ${user.kycVerified}`);
            console.log(`Govt ID Front URL: ${user.govtIdFrontUrl}`);

            // Check if AadharDetails exists
            const aadharDetails = await AadharDetails.findOne({ userId: user._id });
            if (aadharDetails) {
                console.log(`✅ AadharDetails found:`);
                console.log(`   - Approval Status: ${aadharDetails.approvalStatus}`);
                console.log(`   - Front Image URL: ${aadharDetails.frontImageUrl}`);
                console.log(`   - Aadhar Number: ${aadharDetails.extractedData?.aadharNumber}`);
                console.log(`   - Name: ${aadharDetails.extractedData?.name}`);
            } else {
                console.log(`❌ No AadharDetails record found`);
                console.log(`   This user will use fallback logic`);
            }
        }

        await mongoose.disconnect();
        console.log('\n✅ Debug complete');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

debugKycStatus();
