// controller.js
// User controller functions (replace with real DB logic later)
const { JsonWebTokenError } = require('jsonwebtoken');
const UserModel = require('./model');
const User = UserModel; // retain existing references
const { BehaviourAnswers, KycDocument, AadharDetails } = require('./model');

// Utility function to check if user's Aadhar is approved
const checkAadharApproval = async (userId) => {
    try {
        const aadharDetails = await AadharDetails.findOne({ userId });
        
        if (!aadharDetails) {
            return {
                isApproved: false,
                status: 'not_submitted',
                message: 'No Aadhar verification found',
                details: null
            };
        }
        
        if (aadharDetails.approvalStatus === 'approved') {
            return {
                isApproved: true,
                status: 'approved',
                message: 'Aadhar verification approved',
                details: {
                    aadharNumber: aadharDetails.extractedData.aadharNumber,
                    name: aadharDetails.extractedData.name,
                    approvalDate: aadharDetails.approvalDate,
                    overallConfidence: aadharDetails.verificationSummary.overallConfidence,
                    verificationMethod: aadharDetails.verificationSummary.verificationMethod
                }
            };
        } else if (aadharDetails.approvalStatus === 'rejected') {
            return {
                isApproved: false,
                status: 'rejected',
                message: 'Aadhar verification rejected',
                details: {
                    rejectionReason: aadharDetails.verificationSummary.verificationNotes,
                    riskScore: aadharDetails.verificationSummary.riskScore,
                    flags: aadharDetails.verificationSummary.flags
                }
            };
        } else {
            return {
                isApproved: false,
                status: 'pending',
                message: 'Aadhar verification pending',
                details: {
                    submittedAt: aadharDetails.auditTrail.uploadedAt,
                    processedAt: aadharDetails.auditTrail.processedAt
                }
            };
        }
    } catch (error) {
        console.error('Error checking Aadhar approval:', error);
        return {
            isApproved: false,
            status: 'error',
            message: 'Error checking Aadhar verification status',
            details: null
        };
    }
};

// Middleware to check Aadhar approval before allowing bookings
const requireAadharApproval = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ 
                message: 'Authentication required',
                error: 'UNAUTHORIZED'
            });
        }

        const aadharStatus = await checkAadharApproval(userId);
        
        if (!aadharStatus.isApproved) {
            return res.status(403).json({
                message: 'Aadhar verification required for booking',
                error: 'AADHAR_NOT_APPROVED',
                aadharStatus: {
                    status: aadharStatus.status,
                    message: aadharStatus.message,
                    details: aadharStatus.details
                },
                action: 'Please complete Aadhar verification to proceed with booking'
            });
        }

        // Add Aadhar details to request for use in booking logic
        req.aadharDetails = aadharStatus.details;
        next();
    } catch (error) {
        console.error('Error in Aadhar approval middleware:', error);
        return res.status(500).json({
            message: 'Error checking Aadhar verification',
            error: 'AADHAR_CHECK_ERROR'
        });
    }
};

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sgMail = require('@sendgrid/mail');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// Configure SendGrid
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
    console.warn('SENDGRID_API_KEY not found. Email verification will not work.');
}

// Initialize Google OAuth client
const googleClient = new OAuth2Client();

// Get all users (admin only)
const getAllUsers = async (req, res) => {
    try {
        const requesterId = req.user?.id;
        const requester = await User.findById(requesterId).lean();
        if (!requester || requester.role !== 2) {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const { page = 1, limit = 50, search = '' } = req.query;
        const p = Math.max(parseInt(page) || 1, 1);
        const l = Math.min(Math.max(parseInt(limit) || 50, 1), 200);

        const query = search
            ? {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { phone: { $regex: search, $options: 'i' } },
                ]
              }
            : {};

        const [items, total] = await Promise.all([
            User.find(query).select('-password').sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
            User.countDocuments(query)
        ]);

        return res.json({
            success: true,
            data: items,
            pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) }
        });
    } catch (e) {
        console.error('getAllUsers error:', e);
        return res.status(500).json({ message: 'Server error' });
    }
};

// Register a new user
const registerUser = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        
        if (existingUser) {
            // If user exists but is not verified, allow them to request verification again
            if (!existingUser.isVerified) {
                console.log(`User ${email} exists but is not verified. Updating with new signup data and generating new verification token.`);
                
                // Update user data with new signup information
                existingUser.name = name;
                existingUser.password = await bcrypt.hash(password, 10);
                existingUser.role = role !== undefined ? role : existingUser.role;
                
                // Generate new verification token
                const verificationToken = crypto.randomBytes(32).toString('hex');
                const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
                
                // Update existing user with new verification token
                existingUser.verificationToken = verificationToken;
                existingUser.verificationTokenExpires = verificationTokenExpires;
                await existingUser.save();
                
                // Create verification link
                const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
                
                // Send verification email
                const msg = {
                    to: email,
                    from: process.env.SENDGRID_FROM_EMAIL || 'noreply@lyvo.com',
                    subject: 'Verify Your Email - Lyvo+ (New Verification Link)',
                    text: `Hello ${existingUser.name}, you've requested to verify your email again. Please use this NEW verification link to complete your account setup: ${verificationLink}`,
                    html: `
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Email Verification</title>
                        </head>
                        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f2f5;">
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f2f5; padding: 20px;">
                                <tr>
                                    <td align="center">
                                        <table width="480" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden;">
                                            <!-- Header -->
                                            <tr>
                                                <td style="background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%); padding: 30px 20px; text-align: center; color: white;">
                                                    <div style="width: 50px; height: 50px; background-color: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                                                        ✉️
                                                    </div>
                                                    <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 5px 0; color: white;">New Verification Link</h1>
                                                    <p style="font-size: 14px; margin: 0; opacity: 0.9; color: white;">Complete your registration with this fresh link</p>
                                                </td>
                                            </tr>
                                            
                                            <!-- Content -->
                                            <tr>
                                                <td style="padding: 30px 20px; text-align: center;">
                                                    <div style="font-size: 16px; color: #333; margin-bottom: 10px; font-weight: 500;">Welcome back to Lyvo+!</div>
                                                    
                                                    <div style="font-size: 14px; color: #666; line-height: 1.4; margin-bottom: 20px;">
                                                        You've requested a new verification link. Please use this fresh link to complete your account setup and secure your account.
                                                    </div>
                                                    
                                                    <div style="background-color: #f8f9fa; padding: 12px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #e53e3e; text-align: left;">
                                                        <strong style="color: #333; font-size: 13px;">Email Address:</strong>
                                                        <div style="font-family: 'Courier New', monospace; font-size: 14px; color: #2c3e50; font-weight: 600; margin-top: 4px;">${email}</div>
                                                    </div>
                                                    
                                                    <a href="${verificationLink}" style="display: inline-block; background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%); color: white; text-decoration: none; padding: 12px 28px; border-radius: 30px; font-size: 15px; font-weight: 600; margin: 15px 0; box-shadow: 0 4px 12px rgba(229, 62, 62, 0.3);">
                                                        ✓ Verify Email Address
                                                    </a>
                                                    
                                                    <div style="background-color: #ffe6e6; border-left: 4px solid #ff4757; padding: 10px 12px; margin: 15px 0; border-radius: 0 6px 6px 0; color: #721c24; font-size: 12px; text-align: left;">
                                                        <strong>⏰ Important:</strong> This verification link will expire in 24 hours for security reasons.
                                                    </div>
                                                    
                                                    <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 12px; margin: 15px 0; color: #856404; font-size: 12px; line-height: 1.3; text-align: left;">
                                                        <span style="font-size: 16px; margin-right: 8px;">🔒</span>
                                                        <strong>Security Notice:</strong> If you didn't create an account with us, please ignore this email. Your email address will not be used for any other purpose.
                                                    </div>
                                                    
                                                    <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #888; line-height: 1.3; text-align: left;">
                                                        <strong>Having trouble with the button?</strong><br>
                                                        Copy and paste the following link into your browser:
                                                        <div style="background-color: #f8f9fa; padding: 8px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 10px; word-break: break-all; margin: 8px 0; border: 1px solid #dee2e6;">${verificationLink}</div>
                                                    </div>
                                                </td>
                                            </tr>
                                            
                                            <!-- Footer -->
                                            <tr>
                                                <td style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
                                                    <p style="margin: 0 0 10px 0;">© 2024 Lyvo. All rights reserved.</p>
                                                    <p style="margin: 0; font-size: 11px; color: #999;">This email was sent to ${email}</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </body>
                        </html>
                    `
                };
                
                // Try to send verification email
                try {
                    await sgMail.send(msg);
                    console.log('Verification email sent successfully to existing user:', email);
                    
                    return res.status(200).json({ 
                        message: 'Verification email sent! Please check your email to verify your account.',
                        user: {
                            _id: existingUser._id,
                            name: existingUser.name,
                            email: existingUser.email,
                            isVerified: existingUser.isVerified
                        },
                        emailSent: true,
                        existingUser: true
                    });
                } catch (emailError) {
                    console.error('SendGrid error for existing user:', emailError);
                    
                    return res.status(200).json({ 
                        message: 'Account found but email service temporarily unavailable. Please try again later.',
                        user: {
                            _id: existingUser._id,
                            name: existingUser.name,
                            email: existingUser.email,
                            isVerified: existingUser.isVerified
                        },
                        emailSent: false,
                        emailError: 'Email service temporarily unavailable',
                        existingUser: true
                    });
                }
            } else {
                // User exists and is already verified
                return res.status(400).json({ 
                    message: 'User already exists and is verified. Please log in instead.',
                    existingUser: true,
                    isVerified: true
                });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Create new user (not saved yet)
        const user = new User({
            name,
            email,
            password: hashedPassword,
            role: role !== undefined ? role : 1, // default to 1 (normal user)
            isVerified: false,
            verificationToken,
            verificationTokenExpires,
        });

        // Save user to database
        await user.save();

        // Create verification link
        const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;

                // Send verification email
        const msg = {
            to: email,
            from: process.env.SENDGRID_FROM_EMAIL || 'noreply@lyvo.com',
            subject: 'Verify Your Email - Lyvo',
            text: `Hello ${name}, thank you for signing up with Lyvo! To complete your registration and secure your account, please verify your email address by clicking this link: ${verificationLink}`,
            html: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Email Verification</title>
                </head>
                <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f2f5;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f2f5; padding: 20px;">
                        <tr>
                            <td align="center">
                                <table width="480" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden;">
                                    <!-- Header -->
                                    <tr>
                                        <td style="background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%); padding: 30px 20px; text-align: center; color: white;">
                                            <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
                                                <div style="width: 60px; height: 60px; background-color: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-right: 15px; backdrop-filter: blur(10px);">
                                                    <img src="https://lyvo.com/Lyvo_no_bg.png" alt="Lyvo Logo" style="width: 40px; height: 40px; border-radius: 8px; object-fit: contain;" />
                                                </div>
                                                <div style="text-align: left;">
                                                    <h1 style="font-size: 24px; font-weight: 700; margin: 0; color: white;">Lyvo+</h1>
                                                    <p style="font-size: 12px; margin: 0; opacity: 0.9; color: white;">Co-Living Platform</p>
                                                </div>
                                            </div>
                                            <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 5px 0; color: white;">Verify Your Email</h2>
                                            <p style="font-size: 14px; margin: 0; opacity: 0.9; color: white;">Complete your registration in just one click</p>
                                        </td>
                                    </tr>
                                    
                                    <!-- Content -->
                                    <tr>
                                        <td style="padding: 30px 20px; text-align: center;">
                                            <div style="font-size: 16px; color: #333; margin-bottom: 10px; font-weight: 500;">Welcome to Lyvo!</div>
                                            
                                            <div style="font-size: 14px; color: #666; line-height: 1.4; margin-bottom: 20px;">
                                                Thank you for signing up. To complete your registration and secure your account, please verify your email address by clicking the button below.
                                            </div>
                                            
                                            <div style="background-color: #f8f9fa; padding: 12px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #e53e3e; text-align: left;">
                                                <strong style="color: #333; font-size: 13px;">Email Address:</strong>
                                                <div style="font-family: 'Courier New', monospace; font-size: 14px; color: #2c3e50; font-weight: 600; margin-top: 4px;">${email}</div>
                                            </div>
                                            
                                            <a href="${verificationLink}" style="display: inline-block; background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%); color: white; text-decoration: none; padding: 12px 28px; border-radius: 30px; font-size: 15px; font-weight: 600; margin: 15px 0; box-shadow: 0 4px 12px rgba(229, 62, 62, 0.3);">
                                                ✓ Verify Email Address
                                            </a>
                                            
                                            <div style="background-color: #ffe6e6; border-left: 4px solid #ff4757; padding: 10px 12px; margin: 15px 0; border-radius: 0 6px 6px 0; color: #721c24; font-size: 12px; text-align: left;">
                                                <strong>⏰ Important:</strong> This verification link will expire in 24 hours for security reasons.
                                            </div>
                                            
                                            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 12px; margin: 15px 0; color: #856404; font-size: 12px; line-height: 1.3; text-align: left;">
                                                <span style="font-size: 16px; margin-right: 8px;">🔒</span>
                                                <strong>Security Notice:</strong> If you didn't create an account with us, please ignore this email. Your email address will not be used for any other purpose.
                                            </div>
                                            
                                            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #888; line-height: 1.3; text-align: left;">
                                                <strong>Having trouble with the button?</strong><br>
                                                Copy and paste the following link into your browser:
                                                <div style="background-color: #f8f9fa; padding: 8px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 10px; word-break: break-all; margin: 8px 0; border: 1px solid #dee2e6;">${verificationLink}</div>
                                            </div>
                                        </td>
                                    </tr>
                                    
                                    <!-- Footer -->
                                    <tr>
                                        <td style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
                                            <p style="margin: 0 0 10px 0;">© 2024 Lyvo. All rights reserved.</p>
                                            <p style="margin: 0; font-size: 11px; color: #999;">This email was sent to ${email}</p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
            `
        };

        // Try to send verification email
        try {
            await sgMail.send(msg);
            console.log('Email sent successfully to:', email);
        } catch (emailError) {
            console.error('SendGrid error:', emailError);
            
            // If SendGrid fails, still create the user but inform about email issue
            res.status(201).json({ 
                message: 'Registration successful! Please check your email and click the verification link to complete your registration.',
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    isVerified: user.isVerified
                },
                emailSent: false,
                emailError: 'Email service temporarily unavailable'
            });
            return;
        }

        res.status(201).json({ 
            message: 'Registration successful! Please check your email to verify your account.',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                isVerified: user.isVerified
            },
            emailSent: true
        });
    } catch (error) {
        console.error('Registration error:', error);
        
        // Provide more specific error messages
        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                message: 'Validation error: ' + Object.values(error.errors).map(e => e.message).join(', ')
            });
        }
        
        if (error.code === 11000) {
            return res.status(400).json({ 
                message: 'User with this email already exists'
            });
        }
        
        res.status(500).json({ 
            message: 'Server error during registration. Please try again later.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Verify email address
const verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;

        // Find user with this verification token
        const user = await User.findOne({ 
            verificationToken: token,
            verificationTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired verification token' });
        }

        // Update user as verified
        user.isVerified = true;
        user.verificationToken = null;
        user.verificationTokenExpires = null;
        await user.save();

        // Send welcome email
        if (process.env.SENDGRID_API_KEY) {
            try {
                // Role-specific welcome messages
                let welcomeSubject, welcomeText, welcomeHtml;
                
                if (user.role === 3) {
                    // Property Owner
                    welcomeSubject = 'Welcome to Lyvo+ - Property Owner Account Verified! 🏠🎉';
                    welcomeText = `Welcome to Lyvo+! Your property owner account has been successfully verified. Start listing your properties and connecting with room seekers today!`;
                } else if (user.role === 2) {
                    // Admin
                    welcomeSubject = 'Welcome to Lyvo+ - Admin Account Verified! 🔐🎉';
                    welcomeText = `Welcome to Lyvo+! Your admin account has been successfully verified. You now have access to the admin dashboard.`;
                } else {
                    // Room Seeker (default)
                    welcomeSubject = 'Welcome to Lyvo+ - Your Account is Verified! 🎉';
                    welcomeText = `Welcome to Lyvo+! Your account has been successfully verified. Start exploring amazing co-living spaces today!`;
                }
                
                const welcomeMsg = {
                    to: user.email,
                    from: process.env.SENDGRID_FROM_EMAIL || 'noreply@lyvo.com',
                    subject: welcomeSubject,
                    text: welcomeText,
                    html: `
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Welcome to Lyvo+</title>
                        </head>
                        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
                            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
                                <!-- Header -->
                                <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center; position: relative;">
                                    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="50" cy="50" r="1" fill="white" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>') repeat;"></div>
                                    <div style="position: relative; z-index: 1;">
                                        <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                                            <div style="width: 80px; height: 80px; background: rgba(255, 255, 255, 0.2); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin-right: 20px; backdrop-filter: blur(10px);">
                                                <img src="https://lyvo.com/Lyvo_no_bg.png" alt="Lyvo Logo" style="width: 50px; height: 50px; border-radius: 10px; object-fit: contain;" />
                                            </div>
                                            <div style="text-align: left;">
                                                <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">Lyvo+</h1>
                                                <p style="color: rgba(255, 255, 255, 0.9); margin: 0; font-size: 14px; font-weight: 500;">Co-Living Platform</p>
                                            </div>
                                        </div>
                                        <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 16px; font-weight: 500;">Account Successfully Verified!</p>
                                    </div>
                                </div>

                                <!-- Content -->
                                <div style="padding: 40px 30px;">
                                    <div style="text-align: center; margin-bottom: 30px;">
                                        <h2 style="color: #1f2937; margin: 0 0 10px 0; font-size: 24px; font-weight: 600;">Welcome to Lyvo+!</h2>
                                        <p style="color: #6b7280; margin: 0; font-size: 16px; line-height: 1.6;">
                                            ${user.role === 3 ? 'Hi ' + user.name + ', your property owner account is now verified and ready to go!' : 
                                              user.role === 2 ? 'Hi ' + user.name + ', your admin account is now verified and ready to go!' : 
                                              'Hi ' + user.name + ', your account is now verified and ready to go!'}
                                        </p>
                                    </div>

                                    <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 12px; padding: 24px; margin-bottom: 30px; border-left: 4px solid #10b981;">
                                        <p style="color: #065f46; margin: 0; font-size: 15px; line-height: 1.6; font-weight: 500;">
                                            ✅ Your email has been successfully verified! You now have full access to all Lyvo+ features.
                                        </p>
                                    </div>

                                    <div style="text-align: center; margin: 30px 0;">
                                        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}${user.role === 3 ? '/owner-dashboard' : user.role === 2 ? '/admin-dashboard' : '/dashboard'}" 
                                           style="
                                                display: inline-block;
                                                padding: 16px 32px;
                                                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                                                color: white;
                                                text-decoration: none;
                                                border-radius: 12px;
                                                font-weight: 600;
                                                font-size: 16px;
                                                box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
                                                transition: all 0.3s ease;
                                                position: relative;
                                                overflow: hidden;
                                           "
                                           onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 25px rgba(16, 185, 129, 0.4)'"
                                           onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(16, 185, 129, 0.3)'">
                                            <span style="position: relative; z-index: 1;">
                                                ${user.role === 3 ? 'Go to Owner Dashboard' : 
                                                  user.role === 2 ? 'Go to Admin Dashboard' : 
                                                  'Start Exploring'}
                                            </span>
                                        </a>
                                    </div>

                                    <!-- Next Steps -->
                                    <div style="margin: 30px 0;">
                                        <h3 style="color: #1f2937; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">What You Can Do Now</h3>
                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                                            ${user.role === 3 ? `
                                            <!-- Property Owner Actions -->
                                            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
                                                <div style="font-size: 24px; margin-bottom: 8px;">🏠</div>
                                                <p style="color: #374151; margin: 0; font-size: 14px; font-weight: 500;">List Properties</p>
                                            </div>
                                            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
                                                <div style="font-size: 24px; margin-bottom: 8px;">👥</div>
                                                <p style="color: #374151; margin: 0; font-size: 14px; font-weight: 500;">Manage Tenants</p>
                                            </div>
                                            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
                                                <div style="font-size: 24px; margin-bottom: 8px;">💳</div>
                                                <p style="color: #374151; margin: 0; font-size: 14px; font-weight: 500;">Receive Payments</p>
                                            </div>
                                            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
                                                <div style="font-size: 24px; margin-bottom: 8px;">⭐</div>
                                                <p style="color: #374151; margin: 0; font-size: 14px; font-weight: 500;">Property Analytics</p>
                                            </div>
                                            ` : user.role === 2 ? `
                                            <!-- Admin Actions -->
                                            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
                                                <div style="font-size: 24px; margin-bottom: 8px;">🔐</div>
                                                <p style="color: #374151; margin: 0; font-size: 14px; font-weight: 500;">User Management</p>
                                            </div>
                                            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
                                                <div style="font-size: 24px; margin-bottom: 8px;">📊</div>
                                                <p style="color: #374151; margin: 0; font-size: 14px; font-weight: 500;">System Analytics</p>
                                            </div>
                                            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
                                                <div style="font-size: 24px; margin-bottom: 8px;">⚙️</div>
                                                <p style="color: #374151; margin: 0; font-size: 14px; font-weight: 500;">System Settings</p>
                                            </div>
                                            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
                                                <div style="font-size: 24px; margin-bottom: 8px;">🛡️</div>
                                                <p style="color: #374151; margin: 0; font-size: 14px; font-weight: 500;">Security & Access</p>
                                            </div>
                                            ` : `
                                            <!-- Room Seeker Actions (Default) -->
                                            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
                                                <div style="font-size: 24px; margin-bottom: 8px;">🏠</div>
                                                <p style="color: #374151; margin: 0; font-size: 14px; font-weight: 500;">Browse Accommodations</p>
                                            </div>
                                            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; text-align: 16px; text-align: center;">
                                                <div style="font-size: 24px; margin-bottom: 8px;">👥</div>
                                                <p style="color: #374151; margin: 0; font-size: 14px; font-weight: 500;">Find Roommates</p>
                                            </div>
                                            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
                                                <div style="font-size: 24px; margin-bottom: 8px;">💳</div>
                                                <p style="color: #374151; margin: 0; font-size: 14px; font-weight: 500;">Secure Payments</p>
                                            </div>
                                            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center;">
                                                <div style="font-size: 24px; margin-bottom: 8px;">⭐</div>
                                                <p style="color: #374151; margin: 0; font-size: 14px; font-weight: 500;">Rate & Review</p>
                                            </div>
                                            `}
                                        </div>
                                    </div>

                                    <!-- Quick Tips -->
                                    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                        <h4 style="color: #1f2937; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">💡 Quick Tips</h4>
                                        <ul style="color: #374151; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6;">
                                            ${user.role === 3 ? `
                                            <!-- Property Owner Tips -->
                                            <li style="margin-bottom: 6px;">Complete your property details to attract more tenants</li>
                                            <li style="margin-bottom: 6px;">Set competitive pricing based on market rates</li>
                                            <li style="margin-bottom: 6px;">Enable notifications for new tenant inquiries</li>
                                            <li>Use high-quality photos to showcase your properties</li>
                                            ` : user.role === 2 ? `
                                            <!-- Admin Tips -->
                                            <li style="margin-bottom: 6px;">Monitor system performance and user activity</li>
                                            <li style="margin-bottom: 6px;">Review and moderate user-generated content</li>
                                            <li style="margin-bottom: 6px;">Keep system settings updated and secure</li>
                                            <li>Regularly backup important system data</li>
                                            ` : `
                                            <!-- Room Seeker Tips (Default) -->
                                            <li style="margin-bottom: 6px;">Complete your profile to get better roommate matches</li>
                                            <li style="margin-bottom: 6px;">Set your preferences to see relevant accommodations</li>
                                            <li style="margin-bottom: 6px;">Enable notifications to stay updated on new listings</li>
                                            <li>Join our community forums to connect with other members</li>
                                            `}
                                        </ul>
                                    </div>
                                </div>

                                <!-- Footer -->
                                <div style="background: #f9fafb; padding: 24px 30px; border-top: 1px solid #e5e7eb;">
                                    <div style="text-align: center; margin-bottom: 16px;">
                                        <p style="color: #6b7280; margin: 0; font-size: 14px; line-height: 1.5;">
                                            🎉 Welcome to the Lyvo+ community!<br>
                                            💬 Need help? Our support team is here for you.
                                        </p>
                                    </div>
                                    <div style="text-align: center;">
                                        <p style="color: #9ca3af; margin: 0; font-size: 12px;">
                                            © 2024 Lyvo+. All rights reserved. | 
                                            <a href="#" style="color: #10b981; text-decoration: none;">Privacy Policy</a> | 
                                            <a href="#" style="color: #10b981; text-decoration: none;">Terms of Service</a>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </body>
                        </html>
                    `,
                };
                await sgMail.send(welcomeMsg);
                console.log('Welcome email sent successfully to:', user.email);
            } catch (emailError) {
                console.error('Welcome email error:', emailError);
            }
        }

        // Generate JWT token for automatic login after verification
        const jwtToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Omit password from response
        const userResponse = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
            // Include onboarding status fields
            isNewUser: user.isNewUser,
            hasCompletedBehaviorQuestions: user.hasCompletedBehaviorQuestions,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };

        res.status(200).json({ 
            message: 'Email verified successfully! You can now log in to your account.',
            user: userResponse,
            token: jwtToken
        });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ message: 'Server error during email verification' });
    }
};

// Login a user
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Check if email is verified
        if (!user.isVerified) {
            return res.status(400).json({ 
                message: 'Please verify your email address before logging in. Check your inbox for the verification link.' 
            });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid password' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Omit password from response
        const userResponse = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
            profilePicture: user.profilePicture,
            phone: user.phone,
            location: user.location,
            bio: user.bio,
            occupation: user.occupation,
            company: user.company,
            workSchedule: user.workSchedule,
            preferredLocation: user.preferredLocation,
            budget: user.budget,
            roomType: user.roomType,
            genderPreference: user.genderPreference,
            lifestyle: user.lifestyle,
            cleanliness: user.cleanliness,
            noiseLevel: user.noiseLevel,
            smoking: user.smoking,
            pets: user.pets,
            amenities: user.amenities,
            // Include onboarding status fields
            isNewUser: user.isNewUser,
            hasCompletedBehaviorQuestions: user.hasCompletedBehaviorQuestions,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };

        res.status(200).json({ message: 'logged in', user: userResponse, token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Forgot password - send reset email
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found with this email address' });
        }

        // Generate reset token (expires in 1 hour)
        const resetToken = jwt.sign(
            { id: user._id, type: 'password_reset' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Construct reset link (adjust frontend URL as needed)
        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

                // Send email
        const msg = {
            to: email,
            from: process.env.SENDGRID_FROM_EMAIL, // Must be a verified sender
            subject: 'Reset Your Password - Lyvo',
            text: `Hi ${user.name}, we received a request to reset your password. Click this link: ${resetLink}`,
            html: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Reset Your Password</title>
                </head>
                <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f2f5;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f2f5; padding: 20px;">
                        <tr>
                            <td align="center">
                                <table width="480" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden;">
                                    <!-- Header -->
                                    <tr>
                                        <td style="background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%); padding: 30px 20px; text-align: center; color: white;">
                                            <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
                                                <div style="width: 60px; height: 60px; background-color: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-right: 15px; backdrop-filter: blur(10px);">
                                                    <img src="https://lyvo.com/Lyvo_no_bg.png" alt="Lyvo Logo" style="width: 40px; height: 40px; border-radius: 8px; object-fit: contain;" />
                                                </div>
                                                <div style="text-align: left;">
                                                    <h1 style="font-size: 24px; font-weight: 700; margin: 0; color: white;">Lyvo+</h1>
                                                    <p style="font-size: 12px; margin: 0; opacity: 0.9; color: white;">Co-Living Platform</p>
                                                </div>
                                            </div>
                                            <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 5px 0; color: white;">Reset Your Password</h2>
                                            <p style="font-size: 14px; margin: 0; opacity: 0.9; color: white;">Secure your account with a new password</p>
                                        </td>
                                    </tr>
                                    
                                    <!-- Content -->
                                    <tr>
                                        <td style="padding: 30px 20px; text-align: center;">
                                            <div style="font-size: 16px; color: #333; margin-bottom: 10px; font-weight: 500;">Hi ${user.name}!</div>
                                            
                                            <div style="font-size: 14px; color: #666; line-height: 1.4; margin-bottom: 20px;">
                                                We received a request to reset your password. Click the button below to choose a new password for your account.
                                            </div>
                                            
                                            <div style="background-color: #f8f9fa; padding: 12px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #e53e3e; text-align: left;">
                                                <strong style="color: #333; font-size: 13px;">Account Email:</strong>
                                                <div style="font-family: 'Courier New', monospace; font-size: 14px; color: #2c3e50; font-weight: 600; margin-top: 4px;">${email}</div>
                                            </div>
                                            
                                            <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%); color: white; text-decoration: none; padding: 12px 28px; border-radius: 30px; font-size: 15px; font-weight: 600; margin: 15px 0; box-shadow: 0 4px 12px rgba(229, 62, 62, 0.3);">
                                                🔑 Reset Password
                                            </a>
                                            
                                            <div style="background-color: #ffe6e6; border-left: 4px solid #ff4757; padding: 10px 12px; margin: 15px 0; border-radius: 0 6px 6px 0; color: #721c24; font-size: 12px; text-align: left;">
                                                <strong>⏰ Important:</strong> This password reset link will expire in 1 hour for security reasons.
                                            </div>
                                            
                                            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 12px; margin: 15px 0; color: #856404; font-size: 12px; line-height: 1.3; text-align: left;">
                                                <span style="font-size: 16px; margin-right: 8px;">🔒</span>
                                                <strong>Security Notice:</strong> If you didn't request a password reset, please ignore this email. Your account security is important to us.
                                            </div>
                                            
                                            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #888; line-height: 1.3; text-align: left;">
                                                <strong>Having trouble with the button?</strong><br>
                                                Copy and paste the following link into your browser:
                                                <div style="background-color: #f8f9fa; padding: 8px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 10px; word-break: break-all; margin: 8px 0; border: 1px solid #dee2e6;">${resetLink}</div>
                                            </div>
                                        </td>
                                    </tr>
                                    
                                    <!-- Footer -->
                                    <tr>
                                        <td style="background-color: #f8f9fa; padding: 15px; text-align: center; border-top: 1px solid #eee; font-size: 12px; color: #666;">
                                            <p style="margin: 0 0 6px 0;"><strong>Lyvo</strong></p>
                                            <p style="margin: 0 0 6px 0;">Co-living Platform</p>
                                            <p style="margin: 0 0 6px 0;">
                                                Need help? <a href="mailto:support@lyvo.com" style="color: #4CAF50; text-decoration: none;">Contact Support</a> | 
                                                <a href="#" style="color: #4CAF50; text-decoration: none;">Privacy Policy</a>
                                            </p>
                                            <p style="margin: 10px 0 0 0; font-size: 11px; color: #999;">
                                                This email was sent to ${email}. If you believe this was sent to you by mistake, please ignore this email.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
            `,
        };

        await sgMail.send(msg);

        res.status(200).json({ message: 'Password reset link sent to your email' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const resetPassword = async (req, res) => {
  try {
    // Extract token and new password from request body
    const { token, password } = req.body;
    // Check if token and password are provided
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and new password are required.' });
    }
    // Attempt to verify the token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // If token verification fails, return an error response
      return res.status(400).json({ message: 'Invalid or expired token.' });
    }
    // Check if the decoded token contains a valid user ID and is of type 'password_reset'
    if (!decoded.id || decoded.type !== 'password_reset') {
      return res.status(400).json({ message: 'Invalid token.' });
    }
    // Find the user associated with the decoded token ID
    const user = await User.findById(decoded.id);
    // If the user is not found, return an error response
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Update the user's password with the hashed new password
    user.password = hashedPassword;
    await user.save();
    // Return a success response if the password reset is successful
    res.status(200).json({ message: 'Password reset successful.' });
  } catch (error) {
    // Log any errors that occur during the password reset process
    console.error('Reset password error:', error);
    // Return a server error response if an error occurs
    res.status(500).json({ message: 'Server error' });
  }
};

// Change password
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id; // From JWT token

        // Validate input
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                success: false,
                message: 'Both current password and new password are required' 
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ 
                success: false,
                message: 'New password must be at least 8 characters long' 
            });
        }

        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        // Check if user has a password set (some users might have signed up with Google)
        if (!user.password) {
            return res.status(400).json({ 
                success: false,
                message: 'This account was created with social login. Please use "Forgot Password" to set a password first.' 
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ 
                success: false,
                message: 'Current password is incorrect' 
            });
        }

        // Hash new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        user.password = hashedNewPassword;
        await user.save();

        res.status(200).json({ 
            success: true,
            message: 'Password updated successfully' 
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error while changing password' 
        });
    }
};

// Get user profile by ID
const getUserProfile = async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Validate userId
        if (!userId || userId === 'undefined' || userId === 'null') {
            return res.status(400).json({ message: 'Valid user ID is required' });
        }
        
        // Find user by ID
        const user = await User.findById(userId).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json(user);
    } catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Update user profile
const updateUserProfile = async (req, res) => {
    try {
        const { userId } = req.params;
        const updateData = req.body;
        
        // Ensure user can only update their own profile
        if (req.user.id !== userId) {
            return res.status(403).json({ message: 'You can only update your own profile' });
        }
        
        // Remove sensitive fields that shouldn't be updated through this endpoint
        const { email, password, googleId, role, isVerified, verificationToken, verificationTokenExpires, ...safeUpdateData } = updateData;
        
        // Find and update user
        const user = await User.findByIdAndUpdate(
            userId,
            { $set: safeUpdateData },
            { new: true, runValidators: true }
        ).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ 
            message: 'Profile updated successfully',
            user: user
        });
    } catch (error) {
        console.error('Update user profile error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Google Sign-In
const googleSignIn = async (req, res) => {
    try {
        const { credential, role } = req.body;

        console.log('Google Sign-in request received:', {
            hasCredential: !!credential,
            credentialLength: credential ? credential.length : 0,
            role: role,
            clientId: process.env.GOOGLE_CLIENT_ID || '864948749872-dh9vc6atlj2psgd53oiqg99kqgdbusfe.apps.googleusercontent.com',
            credentialStart: credential ? credential.substring(0, 50) : 'none'
        });

        if (!credential) {
            return res.status(400).json({ message: 'Google credential is required' });
        }

        // Verify the Google token
        console.log('Verifying Google token...');
        console.log('Google Client ID:', process.env.GOOGLE_CLIENT_ID || '864948749872-dh9vc6atlj2psgd53oiqg99kqgdbusfe.apps.googleusercontent.com');
        
        let ticket;
        try {
            ticket = await googleClient.verifyIdToken({
                idToken: credential,
                audience: process.env.GOOGLE_CLIENT_ID || '864948749872-dh9vc6atlj2psgd53oiqg99kqgdbusfe.apps.googleusercontent.com',
            });
            console.log('Google token verified successfully');
        } catch (verifyError) {
            console.error('Google token verification failed:', verifyError);
            console.error('Full Google verification error details:', {
                message: verifyError.message,
                code: verifyError.code,
                stack: verifyError.stack
            });
            throw verifyError;
        }

        const payload = ticket.getPayload();
        const { email, name, picture, sub: googleId } = payload;

        // Check if user already exists
        let user = await User.findOne({ email });

        if (!user) {
            // Create new user with Google data
            user = new User({
                name: name,
                email: email,
                googleId: googleId,
                profilePicture: picture, // Store Google profile picture
                role: role !== undefined ? role : 1, // Use provided role or default to 1
                isVerified: true, // Google users are pre-verified
                password: crypto.randomBytes(32).toString('hex'), // Generate random password for Google users
            });
            await user.save();
        } else {
            // Update existing user with Google ID and profile picture if not present
            if (!user.googleId) {
                user.googleId = googleId;
                user.isVerified = true;
                // Only update profile picture if user doesn't have one or if it's from Google
                if (!user.profilePicture) {
                    user.profilePicture = picture;
                }
                await user.save();
            }
            
            // SECURITY FIX: Prevent role switching via Google signup
            // If user already exists with a different role, reject the signup
            if (role !== undefined && user.role !== role) {
                const roleNames = { 1: 'Room Seeker', 2: 'Admin', 3: 'Property Owner' };
                const currentRoleName = roleNames[user.role] || 'Unknown';
                const requestedRoleName = roleNames[role] || 'Unknown';
                
                console.log(`SECURITY ALERT: User ${user.email} attempted to change role from ${currentRoleName} to ${requestedRoleName} via Google signup`);
                
                return res.status(400).json({ 
                    message: `This email is already registered as a ${currentRoleName}. You cannot change your account type using Google signup. Please use the regular login instead.`,
                    errorCode: 'ROLE_CONFLICT',
                    currentRole: user.role,
                    requestedRole: role
                });
            }
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Omit password from response
        const userResponse = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
            googleId: user.googleId,
            profilePicture: user.profilePicture,
            phone: user.phone,
            location: user.location,
            bio: user.bio,
            occupation: user.occupation,
            company: user.company,
            workSchedule: user.workSchedule,
            preferredLocation: user.preferredLocation,
            budget: user.budget,
            roomType: user.roomType,
            genderPreference: user.genderPreference,
            lifestyle: user.lifestyle,
            cleanliness: user.cleanliness,
            noiseLevel: user.noiseLevel,
            smoking: user.smoking,
            pets: user.pets,
            amenities: user.amenities,
            // Include onboarding status fields
            isNewUser: user.isNewUser,
            hasCompletedBehaviorQuestions: user.hasCompletedBehaviorQuestions,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };

        res.status(200).json({ 
            message: 'Google sign-in successful', 
            user: userResponse, 
            token 
        });

    } catch (error) {
        console.error('Google sign-in error:', error);
        
        // More specific error handling
        if (error.message && error.message.includes('Wrong number of segments')) {
            return res.status(400).json({ message: 'Invalid Google token format' });
        }
        
        if (error.message && error.message.includes('Token used too late')) {
            return res.status(400).json({ message: 'Google token has expired' });
        }
        
        if (error.message && error.message.includes('Invalid token signature')) {
            return res.status(400).json({ message: 'Invalid Google token signature' });
        }
        
        if (error.message && error.message.includes('Audience mismatch')) {
            return res.status(400).json({ message: 'Google token audience mismatch' });
        }
        
        if (error.message && error.message.includes('No pem found for envelope')) {
            return res.status(400).json({ message: 'Google token verification failed - invalid token format' });
        }
        
        // Log the full error for debugging
        console.error('Full Google sign-in error details:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
        res.status(500).json({ 
            message: 'Server error during Google sign-in',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Upload profile picture
const uploadProfilePicture = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file provided' });
        }

        const userId = req.user?.id; // From JWT token

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Convert buffer to base64
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'lyvo-profile-pictures',
            transformation: [
                { width: 400, height: 400, crop: 'fill', gravity: 'face' },
                { quality: 'auto', fetch_format: 'auto' }
            ]
        });

        // Update user profile picture
        user.profilePicture = result.secure_url;
        await user.save();

        // Omit password from response
        const userResponse = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
            googleId: user.googleId,
            profilePicture: user.profilePicture,
            phone: user.phone,
            location: user.location,
            bio: user.bio,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };

        res.status(200).json({ 
            message: 'Profile picture uploaded successfully',
            user: userResponse,
            imageUrl: result.secure_url
        });

    } catch (error) {
        console.error('Profile picture upload error:', error);
        res.status(500).json({ message: 'Server error during profile picture upload' });
    }
};

// Create new admin (admin only)
const createAdmin = async (req, res) => {
    try {
        // Verify requester is admin
        const requesterId = req.user?.id;
        const requester = await User.findById(requesterId).lean();
        if (!requester || requester.role !== 2) {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const { name, email, password, role } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, and password are required' });
        }

        // Validate name length
        if (name.trim().length < 2) {
            return res.status(400).json({ message: 'Name must be at least 2 characters' });
        }
        if (name.trim().length > 50) {
            return res.status(400).json({ message: 'Name must not exceed 50 characters' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        // Validate role is admin (2)
        if (role !== 2) {
            return res.status(400).json({ message: 'Invalid role. Only admin role (2) is allowed' });
        }

        // Check if email already exists (case-insensitive)
        const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingUser) {
            let roleType = 'user';
            if (existingUser.role === 1) roleType = 'Seeker';
            else if (existingUser.role === 2) roleType = 'Admin';
            else if (existingUser.role === 3) roleType = 'Owner';
            
            return res.status(400).json({ 
                message: `This email is already registered as a ${roleType}. Please use a different email address.` 
            });
        }

        // Enhanced password validation
        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters long' });
        }
        
        if (!/[A-Z]/.test(password)) {
            return res.status(400).json({ message: 'Password must contain at least one uppercase letter' });
        }
        
        if (!/[a-z]/.test(password)) {
            return res.status(400).json({ message: 'Password must contain at least one lowercase letter' });
        }
        
        if (!/[0-9]/.test(password)) {
            return res.status(400).json({ message: 'Password must contain at least one number' });
        }
        
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            return res.status(400).json({ message: 'Password must contain at least one special character' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new admin user
        const newAdmin = new User({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            role: 2, // Admin role
            isVerified: true, // Admins are pre-verified
            isActive: true
        });

        await newAdmin.save();

        // Send email notification with credentials
        try {
            const msg = {
                to: newAdmin.email,
                from: process.env.SENDGRID_FROM_EMAIL || 'noreply@lyvo.com',
                subject: 'Welcome to Lyvo+ Admin Panel - Your Account Details',
                text: `
Hello ${newAdmin.name},

Welcome to the Lyvo+ Admin Panel!

An administrator account has been created for you with full access to the system.

Your Login Credentials:
Email: ${newAdmin.email}
Password: ${password}

Login URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/login

IMPORTANT SECURITY NOTICE:
- Please change your password after your first login
- Keep your credentials secure and confidential
- Do not share your admin access with others

If you did not expect this email or have any concerns, please contact the system administrator immediately.

Best regards,
The Lyvo+ Team
                `,
                html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Lyvo+ Admin Panel</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #7c3aed, #5b21b6); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 30px; }
        .credentials-box { background: #f3e8ff; border-left: 4px solid #7c3aed; padding: 20px; margin: 20px 0; border-radius: 5px; }
        .credentials-box h3 { margin-top: 0; color: #5b21b6; }
        .credential-item { margin: 10px 0; }
        .credential-label { font-weight: bold; color: #5b21b6; display: inline-block; width: 100px; }
        .credential-value { font-family: monospace; background: white; padding: 5px 10px; border-radius: 3px; display: inline-block; }
        .button { display: inline-block; background: #7c3aed; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .button:hover { background: #5b21b6; }
        .security-notice { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .security-notice h4 { margin-top: 0; color: #d97706; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; color: #666; font-size: 14px; }
        ul { padding-left: 20px; }
        li { margin: 8px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ Welcome to Lyvo+ Admin Panel</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px;">Your administrator account is ready!</p>
        </div>
        <div class="content">
            <h2>Hello ${newAdmin.name}!</h2>
            <p>An administrator account has been created for you with full access to the Lyvo+ system.</p>
            
            <div class="credentials-box">
                <h3>📋 Your Login Credentials</h3>
                <div class="credential-item">
                    <span class="credential-label">Email:</span>
                    <span class="credential-value">${newAdmin.email}</span>
                </div>
                <div class="credential-item">
                    <span class="credential-label">Password:</span>
                    <span class="credential-value">${password}</span>
                </div>
            </div>
            
            <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" class="button">Login to Admin Panel</a>
            </div>
            
            <div class="security-notice">
                <h4>⚠️ IMPORTANT SECURITY NOTICE</h4>
                <ul style="margin: 10px 0;">
                    <li><strong>Change your password</strong> after your first login</li>
                    <li><strong>Keep credentials secure</strong> and confidential</li>
                    <li><strong>Do not share</strong> your admin access with others</li>
                    <li><strong>Use a password manager</strong> for secure storage</li>
                </ul>
            </div>
            
            <h3>🎯 What You Can Do</h3>
            <p>As an administrator, you have access to:</p>
            <ul>
                <li>User Management (Seekers & Owners)</li>
                <li>Property Approvals & Management</li>
                <li>Booking Oversight</li>
                <li>System Settings & Configuration</li>
                <li>Create Additional Admin Accounts</li>
            </ul>
            
            <p style="margin-top: 30px;">If you did not expect this email or have any concerns, please contact the system administrator immediately.</p>
        </div>
        <div class="footer">
            <p><strong>Best regards,</strong><br>The Lyvo+ Team</p>
            <p style="margin-top: 10px;">This is an automated message. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
                `
            };
            
            await sgMail.send(msg);
            console.log('Admin creation email sent successfully to:', newAdmin.email);
        } catch (emailError) {
            console.error('SendGrid error for admin creation:', emailError);
            // Don't fail the admin creation if email fails, just log it
        }

        // Return success (without password)
        const adminData = {
            _id: newAdmin._id,
            name: newAdmin.name,
            email: newAdmin.email,
            role: newAdmin.role,
            isVerified: newAdmin.isVerified,
            createdAt: newAdmin.createdAt
        };

        res.status(201).json({
            success: true,
            message: 'Admin account created successfully. Login credentials have been sent to the email address.',
            admin: adminData,
            emailSent: true
        });

    } catch (error) {
        console.error('createAdmin error:', error);
        res.status(500).json({ message: 'Server error during admin creation' });
    }
};

module.exports = {
    // Export getAllUsers function
    getAllUsers,
    // Export other standalone functions
    registerUser,
    verifyEmail,
    loginUser,
    forgotPassword,
    resetPassword,
    getUserProfile,
    updateUserProfile,
    changePassword,
    googleSignIn,
    uploadProfilePicture,
    upload,
    createAdmin,
    // Save behaviour answers and mark onboarding complete
    saveBehaviourAnswers: async (req, res) => {
        try {
            const userId = req.user.id;
            const { answers } = req.body || {};
            if (!answers || typeof answers !== 'object') {
                return res.status(400).json({ message: 'answers required' });
            }
            await BehaviourAnswers.findOneAndUpdate(
                { userId },
                { answers, completedAt: new Date() },
                { upsert: true, new: true }
            );
            await User.findByIdAndUpdate(userId, { isNewUser: false, hasCompletedBehaviorQuestions: true });
            res.json({ message: 'Saved' });
        } catch (e) {
            console.error('saveBehaviourAnswers error:', e);
            res.status(500).json({ message: 'Server error' });
        }
    },
    // Get behaviour questions (static list here)
    getBehaviourQuestions: async (req, res) => {
        const questions = [
            { id: 'dailyRoutine', text: "What’s your daily routine like?", options: ['Night Owl', 'Early Riser', 'Flexible'] },
            { id: 'socialLevel', text: 'How social are you?', options: ['Prefer private, less interaction', 'Enjoy occasional socializing', 'Very outgoing'] },
            { id: 'smokeDrink', text: 'Do you smoke/drink?', options: ['Yes', 'No'] },
            { id: 'cleanliness', text: 'How do you prefer your living space?', options: ['Very clean & organized', 'Average clean', 'Not too strict about it'] },
            { id: 'foodType', text: 'Your food type?', options: ['Vegetarian', 'Non-Vegetarian', 'Vegan'] },
            { id: 'foodSource', text: 'Do you cook or order food?', options: ['Cook myself', 'Order outside', 'Mix of both'] },
            { id: 'noisePref', text: 'Do you prefer a quiet or lively place?', options: ['Quiet', 'Don’t mind some noise'] },
            { id: 'privacyLevel', text: 'How much personal space do you need?', options: ['High privacy', 'Balanced', 'Don’t mind sharing'] },
            { id: 'budget', text: 'Budget range (₹ per month)?', type: 'range', min: 2000, max: 15000 },
            { id: 'stayDuration', text: 'How long do you plan to stay?', options: ['Short-term (up to 6 months)', 'Long-term (6+ months)'] },
            { id: 'visitorRules', text: 'Do you prefer strict visitor rules?', options: ['Yes', 'No'] },
            { id: 'compatOnly', text: 'Show only compatible roommates?', options: ['Yes', 'No'] }
        ];
        res.json({ questions });
    },
    // Check if user already completed behaviour onboarding
    getBehaviourStatus: async (req, res) => {
        try {
            const userId = req.user.id;
            const existing = await BehaviourAnswers.findOne({ userId }).lean();
            const completed = !!existing;
            // Also reflect from user flags if available
            const user = await User.findById(userId).select('isNewUser hasCompletedBehaviorQuestions').lean();
            const finalCompleted = completed || (user?.hasCompletedBehaviorQuestions === true);
            return res.json({ completed: finalCompleted, userFlags: user });
        } catch (e) {
            console.error('getBehaviourStatus error:', e);
            return res.status(500).json({ message: 'Server error' });
        }
    },
    getAllUsers,
    registerUser,
    verifyEmail,
    loginUser,
    forgotPassword,
    resetPassword,
    getUserProfile,
    updateUserProfile,
    changePassword,
    googleSignIn,
    uploadProfilePicture,
    upload, // Export multer upload middleware
    // Aadhar verification functions
    checkAadharApproval,
    requireAadharApproval,
    getAadharStatus: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Authentication required' });
            }

            const aadharStatus = await checkAadharApproval(userId);
            
            return res.json({
                success: true,
                aadharStatus: {
                    isApproved: aadharStatus.isApproved,
                    status: aadharStatus.status,
                    message: aadharStatus.message,
                    details: aadharStatus.details
                }
            });
        } catch (error) {
            console.error('Error getting Aadhar status:', error);
            return res.status(500).json({ 
                message: 'Error checking Aadhar status',
                error: error.message 
            });
        }
    },
    // KYC: owner uploads govt ID front/back images
    uploadKycDocuments: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: 'Authentication required' });

            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ message: 'User not found' });

            // Get files from request
            const files = req.files || {};
            const frontImage = files.frontImage?.[0];
            const backImage = files.backImage?.[0];
            const { idType } = req.body || {};

            if (!frontImage) {
                return res.status(400).json({ message: 'Front image is required' });
            }

            // First, process OCR to determine if verification will pass
            let ocrResult = null;
            try {
                const axios = require('axios');
                const imageData = frontImage.buffer.toString('base64');
                
                const ocrResponse = await axios.post('http://localhost:5003/ocr/aadhar/base64', {
                    image: imageData
                }, {
                    timeout: 30000, // 30 second timeout
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (ocrResponse.data.success) {
                    ocrResult = ocrResponse.data;
                    console.log('OCR Result:', ocrResult);
                }
            } catch (ocrError) {
                console.error('OCR service error:', ocrError.message);
                // Continue without OCR if service is unavailable
            }

            // Determine KYC status based on OCR results and name matching
            let kycStatus = 'pending';
            let kycVerified = false;
            let confidenceScore = 0;
            let verificationFailureReason = '';

            if (ocrResult && ocrResult.success) {
                confidenceScore = ocrResult.confidence || 0;
                
                // Check if it's a valid Aadhar card
                const isValidAadhar = ocrResult.validation && ocrResult.validation.is_aadhar_card;
                
                // Check name matching
                let nameMatches = false;
                let extractedName = '';
                let userName = '';
                
                if (ocrResult.extracted_data && ocrResult.extracted_data.name) {
                    extractedName = ocrResult.extracted_data.name;
                    userName = user.name || '';
                    
                    // Simple case-insensitive name matching
                    const normalizedExtracted = extractedName.toUpperCase().trim();
                    const normalizedUser = userName.toUpperCase().trim();
                    nameMatches = normalizedExtracted === normalizedUser;
                }
                
                // Only auto-approve if BOTH conditions are met
                if (confidenceScore >= 70 && isValidAadhar && nameMatches) {
                    kycStatus = 'approved';
                    kycVerified = true;
                    console.log(`Auto-approved KYC for user ${userId} - Valid Aadhar + Name Match. Confidence: ${confidenceScore}%`);
                } else {
                    // Determine failure reason
                    if (!isValidAadhar) {
                        verificationFailureReason = 'Invalid Aadhar card detected';
                    } else if (!nameMatches) {
                        verificationFailureReason = `Name mismatch: Document shows "${extractedName}" but profile shows "${userName}"`;
                    } else if (confidenceScore < 70) {
                        verificationFailureReason = `Low confidence score: ${confidenceScore}%`;
                    }
                    
                    kycStatus = 'rejected';
                    kycVerified = false;
                    console.log(`KYC verification failed for user ${userId}. Reason: ${verificationFailureReason}`);
                }
            } else {
                verificationFailureReason = 'OCR processing failed';
                kycStatus = 'rejected';
                kycVerified = false;
            }

            // Only upload to Cloudinary if verification passes
            let frontUrl = null;
            let backUrl = null;

            if (kycVerified) {
                console.log('Verification passed - uploading to Cloudinary...');
                
                const uploadBufferToCloudinary = async (file) => {
                    const b64 = Buffer.from(file.buffer).toString('base64');
                    const dataURI = `data:${file.mimetype};base64,${b64}`;
                    const result = await cloudinary.uploader.upload(dataURI, {
                        folder: 'lyvo-kyc-docs',
                        transformation: [
                            { width: 1600, height: 1600, crop: 'limit' },
                            { quality: 'auto', fetch_format: 'auto' }
                        ]
                    });
                    return result.secure_url;
                };

                // Upload front image
                frontUrl = await uploadBufferToCloudinary(frontImage);
                if (backImage) {
                    backUrl = await uploadBufferToCloudinary(backImage);
                }
                
                console.log('Image uploaded to Cloudinary successfully');
            } else {
                console.log('Verification failed - skipping Cloudinary upload');
            }


            // Update user with KYC information (only if verification passed)
            const updates = {
                govtIdType: idType || 'aadhar',
                kycStatus: kycStatus,
                kycVerified: kycVerified,
                kycReviewedAt: kycVerified ? new Date() : null,
                kycReviewedBy: null  // System approval - no specific reviewer
            };

            // Only add image URLs if verification passed
            if (kycVerified) {
                updates.govtIdFrontUrl = frontUrl;
                updates.govtIdBackUrl = backUrl;
            }

            // Update KYC Document record
            const kycDocUpdate = {
                        idType: idType || 'aadhar',
                        status: kycStatus,
                        reviewedAt: kycVerified ? new Date() : null,
                reviewedBy: null,  // System approval - no specific reviewer
                        ocrData: ocrResult ? {
                            extractedData: ocrResult.extracted_data,
                    validation: ocrResult.validation,
                            confidenceScore: confidenceScore,
                    rawText: ocrResult.raw_text,
                    ocrDetails: ocrResult.ocr_details
                        } : null,
                        confidenceScore: confidenceScore,
                        ocrProcessedAt: new Date()
            };

            // Only add image URLs if verification passed
            if (kycVerified) {
                kycDocUpdate.frontUrl = frontUrl;
                kycDocUpdate.backUrl = backUrl;
            }

            await KycDocument.findOneAndUpdate(
                { userId },
                { $set: kycDocUpdate },
                { upsert: true, new: true }
            );

            // Save comprehensive Aadhar details if verification passes
            if (kycVerified && ocrResult && ocrResult.success) {
                console.log('Saving comprehensive Aadhar details...');
                
                // Prepare name matching results
                const nameMatchResult = {
                    extractedName: ocrResult.extracted_data?.name || '',
                    profileName: user.name || '',
                    nameMatch: true, // We know it matches since verification passed
                    matchConfidence: confidenceScore,
                    matchReason: 'Exact match - verification passed'
                };

                // Prepare Aadhar details document
                const aadharDetailsData = {
                    userId: userId,
                    
                    // Document Images
                    frontImageUrl: frontUrl,
                    backImageUrl: backUrl,
                    
                    // Approval Status
                    approvalStatus: 'approved',
                    approvalDate: new Date(),
                    approvedBy: null, // System approval
                    
                    // OCR Extracted Data
                    extractedData: {
                        aadharNumber: ocrResult.extracted_data?.aadhar_number || '',
                        name: ocrResult.extracted_data?.name || '',
                        dateOfBirth: ocrResult.extracted_data?.date_of_birth || '',
                        gender: ocrResult.extracted_data?.gender || '',
                        mobile: ocrResult.extracted_data?.mobile || null,
                        address: ocrResult.extracted_data?.address || null,
                        fatherName: ocrResult.extracted_data?.father_name || null,
                        motherName: ocrResult.extracted_data?.mother_name || null,
                        vid: ocrResult.extracted_data?.vid || null
                    },
                    
                    // OCR Validation Results
                    validationResults: {
                        isAadharCard: ocrResult.validation?.is_aadhar_card || false,
                        hasAadharKeywords: ocrResult.validation?.has_aadhar_keywords || false,
                        hasAadharNumber: ocrResult.validation?.has_aadhar_number || false,
                        hasName: ocrResult.validation?.has_name || false,
                        hasDob: ocrResult.validation?.has_dob || false,
                        hasGender: ocrResult.validation?.has_gender || false,
                        hasMobile: ocrResult.validation?.has_mobile || false,
                        confidenceScore: ocrResult.validation?.confidence_score || 0,
                        coreFieldsCount: ocrResult.validation?.core_fields_count || 0,
                        totalCoreFields: ocrResult.validation?.total_core_fields || 5
                    },
                    
                    // Name Matching Results
                    nameMatching: nameMatchResult,
                    
                    // OCR Processing Details
                    ocrProcessing: {
                        apiUsed: ocrResult.ocr_details?.api_used || 'OCR.space API',
                        processingTime: ocrResult.ocr_details?.processing_time || null,
                        rawText: ocrResult.raw_text || '',
                        ocrConfidence: ocrResult.ocr_details?.api_confidence || 0,
                        fieldExtractionConfidence: ocrResult.ocr_details?.field_extraction_confidence || 0,
                        validationConfidence: ocrResult.ocr_details?.validation_confidence || 0,
                        processedAt: new Date()
                    },
                    
                    // Verification Summary
                    verificationSummary: {
                        overallConfidence: confidenceScore,
                        verificationMethod: 'auto',
                        verificationNotes: 'Automatically verified - Valid Aadhar + Name match',
                        riskScore: 0,
                        flags: []
                    },
                    
                    // Audit Trail
                    auditTrail: {
                        uploadedAt: new Date(),
                        processedAt: new Date(),
                        approvedAt: new Date(),
                        lastModifiedAt: new Date(),
                        modificationHistory: [{
                            modifiedAt: new Date(),
                            modifiedBy: null,
                            changes: 'Initial verification and approval',
                            reason: 'System auto-approval'
                        }]
                    }
                };

                // Save to AadharDetails collection
                await AadharDetails.findOneAndUpdate(
                    { userId },
                    { $set: aadharDetailsData },
                { upsert: true, new: true }
            );
                
                console.log('Aadhar details saved successfully');
            }

            const updated = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true }).select('-password');

            // Prepare response
            const response = {
                message: kycStatus === 'approved' ? 'KYC verification successful' : 'KYC verification failed',
                kycStatus: kycStatus,
                kycVerified: kycVerified,
                verificationFailureReason: verificationFailureReason || null,
                user: updated
            };

            // Include OCR results in response
            if (ocrResult) {
                response.ocrResult = {
                    extractedData: ocrResult.extracted_data,
                    validation: ocrResult.validation,
                    confidence: confidenceScore,
                    verified: ocrResult.validation?.is_aadhar_card || false,
                    rawText: ocrResult.raw_text,
                    ocrDetails: ocrResult.ocr_details
                };
            }

            return res.json(response);
        } catch (e) {
            console.error('uploadKycDocuments error:', e);
            return res.status(500).json({ message: 'Server error', error: e.message });
        }
    },
    // Admin verifies/rejects KYC
    adminReviewKyc: async (req, res) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: 'Authentication required' });
            const admin = await User.findById(adminId);
            if (!admin || admin.role !== 2) return res.status(403).json({ message: 'Admin access required' });

            const { userId, action } = req.body || {};
            if (!userId || !['approve', 'reject'].includes(action)) {
                return res.status(400).json({ message: 'userId and action (approve|reject) are required' });
            }

            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ message: 'User not found' });

            const update = {
                kycStatus: action === 'approve' ? 'approved' : 'rejected',
                kycVerified: action === 'approve',
                kycReviewedAt: new Date(),
                kycReviewedBy: adminId,
            };

            const updated = await User.findByIdAndUpdate(userId, { $set: update }, { new: true }).select('-password');
            // Mirror status into KycDocument
            await KycDocument.findOneAndUpdate(
                { userId },
                {
                    $set: {
                        status: action === 'approve' ? 'approved' : 'rejected',
                        reviewedAt: new Date(),
                        reviewedBy: adminId
                    }
                },
                { new: true }
            );
            return res.json({ message: `KYC ${action}d`, user: updated });
        } catch (e) {
            console.error('adminReviewKyc error:', e);
            return res.status(500).json({ message: 'Server error' });
        }
    },

    // Admin toggle user active status
    toggleUserStatus: async (req, res) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: 'Authentication required' });
            const admin = await User.findById(adminId);
            if (!admin || admin.role !== 2) return res.status(403).json({ message: 'Admin access required' });

            const { userId } = req.params;
            if (!userId) return res.status(400).json({ message: 'User ID is required' });

            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ message: 'User not found' });

            // Toggle the isActive status
            const newStatus = !user.isActive;
            const updated = await User.findByIdAndUpdate(
                userId, 
                { $set: { isActive: newStatus, statusUpdatedAt: new Date(), statusUpdatedBy: adminId } }, 
                { new: true }
            ).select('-password');

            return res.json({ 
                message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`, 
                user: updated 
            });
        } catch (e) {
            console.error('toggleUserStatus error:', e);
            return res.status(500).json({ message: 'Server error' });
        }
    },

    // Check if email exists (public endpoint for real-time validation)
    checkEmailExists: async (req, res) => {
        try {
            const { email } = req.query;
            if (!email) {
                return res.status(400).json({ message: 'Email is required' });
            }

            const user = await User.findOne({ email: email.toLowerCase().trim() });
            
            if (user) {
                // If user exists but is not verified, consider email as available
                if (!user.isVerified) {
                    return res.json({ 
                        exists: false,
                        message: 'Email is available',
                        isUnverified: true,
                        note: 'This email was previously registered but not verified. You can register again.'
                    });
                } else {
                    // User exists and is verified
                    return res.json({ 
                        exists: true,
                        message: 'Email already registered. Please use a different email.',
                        isVerified: true,
                        role: user.role // Include role information
                    });
                }
            } else {
                // Email is completely new
                return res.json({ 
                    exists: false,
                    message: 'Email is available'
                });
            }
        } catch (e) {
            console.error('checkEmailExists error:', e);
            return res.status(500).json({ message: 'Server error' });
        }
    },

    // Resend verification email for existing unverified users
    resendVerificationEmail: async (req, res) => {
        try {
            const { email } = req.body;
            
            if (!email) {
                return res.status(400).json({ message: 'Email is required' });
            }

            // Find user by email
            const user = await User.findOne({ email: email.toLowerCase().trim() });
            
            if (!user) {
                return res.status(404).json({ 
                    message: 'No account found with this email address. Please sign up first.' 
                });
            }

            if (user.isVerified) {
                return res.status(400).json({ 
                    message: 'This email is already verified. Please log in to your account.' 
                });
            }

            // Generate new verification token
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
            
            // Update user with new verification token
            user.verificationToken = verificationToken;
            user.verificationTokenExpires = verificationTokenExpires;
            await user.save();
            
            // Create verification link
            const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
            
            // Send verification email
            const msg = {
                to: email,
                from: process.env.SENDGRID_FROM_EMAIL || 'noreply@lyvo.com',
                subject: 'Verify Your Lyvo+ Account - New Verification Link',
                text: `
Hello ${user.name},

You requested a new verification link for your Lyvo+ account.

Please click the link below to verify your email address:
${verificationLink}

This link will expire in 24 hours.

If you didn't request this verification email, please ignore this message.

Best regards,
The Lyvo+ Team
                `,
                html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Lyvo+ Account</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 Verify Your Lyvo+ Account</h1>
            <p>New Verification Link Requested</p>
        </div>
        <div class="content">
            <h2>Hello ${user.name}!</h2>
            <p>You requested a new verification link for your Lyvo+ account.</p>
            <p>Please click the button below to verify your email address:</p>
            <div style="text-align: center;">
                <a href="${verificationLink}" class="button">Verify My Email</a>
            </div>
            <p><strong>Important:</strong> This link will expire in 24 hours.</p>
            <p>If you didn't request this verification email, please ignore this message.</p>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #e5e7eb; padding: 10px; border-radius: 5px; font-family: monospace;">${verificationLink}</p>
        </div>
        <div class="footer">
            <p>Best regards,<br>The Lyvo+ Team</p>
            <p>This is an automated message. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
                `
            };
            
            // Try to send verification email
            try {
                await sgMail.send(msg);
                console.log('Verification email resent successfully to:', email);
                
                return res.status(200).json({ 
                    message: 'Verification email sent! Please check your email to verify your account.',
                    emailSent: true,
                    expiresIn: '24 hours'
                });
            } catch (emailError) {
                console.error('SendGrid error for resend verification:', emailError);
                
                return res.status(500).json({ 
                    message: 'Failed to send verification email. Please try again later.',
                    emailSent: false,
                    error: 'Email service temporarily unavailable'
                });
            }
        } catch (error) {
            console.error('Resend verification error:', error);
            res.status(500).json({ message: 'Server error during resend verification' });
        }
    }
}; 