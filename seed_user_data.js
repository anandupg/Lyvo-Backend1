const mongoose = require('mongoose');
const User = require('./src/user/model');
const { AadharDetails } = require('./src/user/model');
const dotenv = require('dotenv');

dotenv.config();

const seedUserData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const email = 'anandupganesh2026@mca.ajce.in';
        const user = await User.findOne({ email });

        if (!user) {
            console.log('User not found!');
            return;
        }

        // Update User Profile
        user.occupation = 'Software Engineer';
        user.location = 'Kochi, Kerala';
        user.gender = 'male';
        user.profilePicture = 'https://res.cloudinary.com/dxtfnvxmz/image/upload/v1767099300/lyvo-profile-pictures/ouu75wjve2gtat6isv6o.jpg'; // Restored original URL
        await user.save();
        console.log('User profile updated');

        // Fully construct valid data
        const validKycData = {
            userId: user._id,
            approvalStatus: 'approved',
            frontImageUrl: "https://res.cloudinary.com/dxtfnvxmz/image/upload/v1767109389/lyvo-kyc-docs/mswgkjfryppdcjkasgiv.jpg", // Restored original URL
            extractedData: {
                name: user.name,
                gender: 'Male',
                dateOfBirth: '01/01/1995',
                aadharNumber: '123456789012',
                address: 'House No. 123, Gandhi Nagar, Kochi, Kerala - 682001',
                mobile: '1234567890',
                fatherName: 'Father Name',
                motherName: 'Mother Name',
                vid: '1234'
            },
            validationResults: {
                isAadharCard: true,
                hasAadharKeywords: true,
                hasAadharNumber: true,
                hasName: true,
                hasDob: true,
                hasGender: true,
                hasMobile: true,
                confidenceScore: 99,
                coreFieldsCount: 5,
                totalCoreFields: 5
            },
            nameMatching: {
                extractedName: user.name,
                profileName: user.name,
                nameMatch: true,
                matchConfidence: 100,
                matchReason: "Perfect match"
            },
            ocrProcessing: {
                apiUsed: "manual",
                ocrConfidence: 100,
                fieldExtractionConfidence: 100,
                validationConfidence: 100
            },
            verificationSummary: {
                overallConfidence: 100
            }
        };

        let kyc = await AadharDetails.findOne({ userId: user._id });

        if (!kyc) {
            kyc = new AadharDetails(validKycData);
        } else {
            // Overwrite existing with valid data
            Object.assign(kyc, validKycData);

            // Explicitly set nested paths
            kyc.extractedData = validKycData.extractedData;
            kyc.validationResults = validKycData.validationResults;
            kyc.nameMatching = validKycData.nameMatching;
            kyc.ocrProcessing = validKycData.ocrProcessing;
            kyc.verificationSummary = validKycData.verificationSummary;
        }

        await kyc.save();
        console.log('KYC address and details updated');

    } catch (err) {
        console.error('Error details:', err);
    } finally {
        await mongoose.disconnect();
    }
};

seedUserData();
