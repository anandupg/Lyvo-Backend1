const mongoose = require('mongoose');
const User = require('./src/user/model');
const { AadharDetails } = require('./src/user/model');
const dotenv = require('dotenv');

dotenv.config();

const auditImages = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const email = 'anandupganesh2026@mca.ajce.in';
        const user = await User.findOne({ email });

        if (!user) {
            console.log('User not found!');
            return;
        }

        const kyc = await AadharDetails.findOne({ userId: user._id });

        const data = {
            user: {
                profilePicture: user.profilePicture,
                picture: user.picture,
                govtIdFrontUrl: user.govtIdFrontUrl,
                govtIdBackUrl: user.govtIdBackUrl
            },
            kyc: kyc ? {
                frontImageUrl: kyc.frontImageUrl,
                backImageUrl: kyc.backImageUrl,
                approvalStatus: kyc.approvalStatus
            } : 'No KYC'
        };
        const fs = require('fs');
        fs.writeFileSync('audit_result.json', JSON.stringify(data, null, 2));
        console.log('Audit saved to audit_result.json');

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
};

auditImages();
