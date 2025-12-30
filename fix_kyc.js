// Quick script to check and fix KYC status
const mongoose = require('mongoose');

// Define schemas inline to avoid import issues
const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    kycStatus: String,
    kycVerified: Boolean,
    govtIdFrontUrl: String
}, { timestamps: true });

const aadharDetailsSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    frontImageUrl: String,
    approvalStatus: String,
    extractedData: {
        aadharNumber: String,
        name: String,
        dob: String,
        gender: String,
        address: String
    },
    verificationSummary: {
        overallConfidence: Number,
        verificationMethod: String,
        verificationNotes: String
    },
    approvalDate: Date,
    auditTrail: {
        uploadedAt: Date,
        processedAt: Date
    }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const AadharDetails = mongoose.model('AadharDetails', aadharDetailsSchema);

async function fixKycStatus() {
    try {
        // Connect using connection string from .env
        const mongoUri = 'mongodb+srv://anandupg:Anandu7710@lyvo.gy0gjrn.mongodb.net/lyvoDB?retryWrites=true&w=majority&appName=Lyvo';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Find users with approved KYC but no AadharDetails
        const approvedUsers = await User.find({ kycStatus: 'approved' });
        console.log(`\nFound ${approvedUsers.length} users with approved KYC`);

        for (const user of approvedUsers) {
            console.log(`\n--- Checking user: ${user.name} (${user.email}) ---`);

            const aadharDetails = await AadharDetails.findOne({ userId: user._id });

            if (!aadharDetails && user.govtIdFrontUrl) {
                console.log('⚠️  Missing AadharDetails, creating fallback record...');

                await AadharDetails.create({
                    userId: user._id,
                    frontImageUrl: user.govtIdFrontUrl,
                    approvalStatus: 'approved',
                    extractedData: {
                        aadharNumber: 'XXXX-XXXX-XXXX',
                        name: user.name,
                        dob: 'N/A',
                        gender: 'N/A',
                        address: 'N/A'
                    },
                    verificationSummary: {
                        overallConfidence: 100,
                        verificationMethod: 'manual_fallback',
                        verificationNotes: 'Legacy approval - created fallback record'
                    },
                    approvalDate: new Date(),
                    auditTrail: {
                        uploadedAt: new Date(),
                        processedAt: new Date()
                    }
                });

                console.log('✅ Created AadharDetails record');
            } else if (aadharDetails) {
                console.log(`✅ AadharDetails exists (Status: ${aadharDetails.approvalStatus})`);
                console.log(`   Image URL: ${aadharDetails.frontImageUrl ? 'Present' : 'MISSING'}`);

                // Fix missing frontImageUrl
                if (!aadharDetails.frontImageUrl && user.govtIdFrontUrl) {
                    aadharDetails.frontImageUrl = user.govtIdFrontUrl;
                    await aadharDetails.save();
                    console.log('✅ Fixed missing frontImageUrl');
                }
            } else {
                console.log('❌ No govtIdFrontUrl available, cannot create fallback');
            }
        }

        await mongoose.disconnect();
        console.log('\n✅ Fix complete!');
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixKycStatus();
