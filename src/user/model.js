const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true, // Allows multiple null values
        trim: true
    },
    profilePicture: {
        type: String,
        default: null,
        trim: true
    },
    phone: {
        type: String,
        default: null,
        trim: true
    },
    location: {
        type: String,
        default: null,
        trim: true
    },
    // Additional profile fields
    age: {
        type: Number,
        default: null,
        min: 0,
        max: 120
    },
    occupation: {
        type: String,
        default: null,
        trim: true
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other', null],
        default: null
    },
    bio: {
        type: String,
        default: null,
        trim: true
    },
    role: {
        type: Number,
        default: 1,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    // KYC fields
    govtIdFrontUrl: {
        type: String,
        default: null,
        trim: true
    },
    govtIdBackUrl: {
        type: String,
        default: null,
        trim: true
    },
    kycVerified: {
        type: Boolean,
        default: false
    },
    kycStatus: {
        type: String,
        enum: ['not_submitted', 'pending', 'approved', 'rejected'],
        default: 'not_submitted'
    },
    kycReviewedAt: {
        type: Date,
        default: null
    },
    kycReviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    verificationToken: {
        type: String,
        default: null,
    },
    verificationTokenExpires: {
        type: Date,
        default: null,
    },
    // Behaviour onboarding flags
    isNewUser: { type: Boolean, default: true },
    hasCompletedBehaviorQuestions: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);

// Behaviour answers schema and model
const behaviourAnswersSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, unique: true },
    answers: { type: Object, default: {} },
    completedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports.BehaviourAnswers = mongoose.model('BehaviourAnswers', behaviourAnswersSchema);

// KYC documents schema and model (separate collection)
const kycDocumentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    idType: { type: String, default: null, trim: true },
    idNumber: { type: String, default: null, trim: true },
    frontUrl: { type: String, default: null, trim: true },
    backUrl: { type: String, default: null, trim: true },
    status: { type: String, enum: ['not_submitted', 'pending', 'approved', 'rejected'], default: 'not_submitted', index: true },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: null, trim: true },
    ocrData: { // Store detailed OCR results
        extractedData: { type: mongoose.Schema.Types.Mixed, default: {} },
        validation: { type: mongoose.Schema.Types.Mixed, default: {} },
        confidenceScore: { type: Number, default: 0 },
        rawText: { type: String, default: null },
        ocrDetails: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    confidenceScore: { type: Number, default: 0 },
    ocrProcessedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports.KycDocument = mongoose.model('KycDocument', kycDocumentSchema);

// Comprehensive Aadhar Details schema for verified documents
const aadharDetailsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },

    // Document Images
    frontImageUrl: {
        type: String,
        required: true,
        trim: true
    },
    backImageUrl: {
        type: String,
        default: null,
        trim: true
    },

    // Approval Status
    approvalStatus: {
        type: String,
        enum: ['approved', 'rejected', 'pending'],
        required: true,
        index: true
    },
    approvalDate: {
        type: Date,
        default: Date.now
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    // OCR Extracted Data
    extractedData: {
        aadharNumber: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        dateOfBirth: {
            type: String,
            required: true,
            trim: true
        },
        gender: {
            type: String,
            required: true,
            trim: true
        },
        mobile: {
            type: String,
            default: null,
            trim: true
        },
        address: {
            type: String,
            default: null,
            trim: true
        },
        fatherName: {
            type: String,
            default: null,
            trim: true
        },
        motherName: {
            type: String,
            default: null,
            trim: true
        },
        vid: {
            type: String,
            default: null,
            trim: true
        }
    },

    // OCR Validation Results
    validationResults: {
        isAadharCard: {
            type: Boolean,
            required: true
        },
        hasAadharKeywords: {
            type: Boolean,
            required: true
        },
        hasAadharNumber: {
            type: Boolean,
            required: true
        },
        hasName: {
            type: Boolean,
            required: true
        },
        hasDob: {
            type: Boolean,
            required: true
        },
        hasGender: {
            type: Boolean,
            required: true
        },
        hasMobile: {
            type: Boolean,
            required: true
        },
        confidenceScore: {
            type: Number,
            required: true
        },
        coreFieldsCount: {
            type: Number,
            required: true
        },
        totalCoreFields: {
            type: Number,
            required: true
        }
    },

    // Name Matching Results
    nameMatching: {
        extractedName: {
            type: String,
            required: true,
            trim: true
        },
        profileName: {
            type: String,
            required: true,
            trim: true
        },
        nameMatch: {
            type: Boolean,
            required: true
        },
        matchConfidence: {
            type: Number,
            required: true
        },
        matchReason: {
            type: String,
            required: true,
            trim: true
        }
    },

    // OCR Processing Details
    ocrProcessing: {
        apiUsed: {
            type: String,
            required: true,
            trim: true
        },
        processingTime: {
            type: Number,
            default: null
        },
        rawText: {
            type: String,
            default: null
        },
        ocrConfidence: {
            type: Number,
            required: true
        },
        fieldExtractionConfidence: {
            type: Number,
            required: true
        },
        validationConfidence: {
            type: Number,
            required: true
        },
        processedAt: {
            type: Date,
            default: Date.now
        }
    },

    // Verification Summary
    verificationSummary: {
        overallConfidence: {
            type: Number,
            required: true
        },
        verificationMethod: {
            type: String,
            enum: ['auto', 'manual'],
            default: 'auto'
        },
        verificationNotes: {
            type: String,
            default: null,
            trim: true
        },
        riskScore: {
            type: Number,
            default: 0
        },
        flags: [{
            type: String,
            trim: true
        }]
    },

    // Audit Trail
    auditTrail: {
        uploadedAt: {
            type: Date,
            default: Date.now
        },
        processedAt: {
            type: Date,
            default: Date.now
        },
        approvedAt: {
            type: Date,
            default: null
        },
        lastModifiedAt: {
            type: Date,
            default: Date.now
        },
        modificationHistory: [{
            modifiedAt: { type: Date, default: Date.now },
            modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            changes: { type: String, trim: true },
            reason: { type: String, trim: true }
        }]
    }
}, {
    timestamps: true,
    // Add indexes for better query performance
    indexes: [
        { userId: 1 },
        { approvalStatus: 1 },
        { 'extractedData.aadharNumber': 1 },
        { 'extractedData.name': 1 },
        { approvalDate: -1 },
        { 'verificationSummary.overallConfidence': -1 }
    ]
});

module.exports.AadharDetails = mongoose.model('AadharDetails', aadharDetailsSchema);
