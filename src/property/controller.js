const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const Razorpay = require('razorpay');
const axios = require('axios');
const sgMail = require('@sendgrid/mail');

// Import Models
const Property = require('./models/Property');
const Room = require('./models/Room');
const Booking = require('./models/Booking');
const Favorite = require('./models/Favorite');
const Tenant = require('./models/Tenant');
const Expense = require('./models/Expense');
const User = require('../user/model');
const { BehaviourAnswers } = require('../user/model');
const CompatibilityEngine = require('./services/compatibilityEngine');
const NotificationService = require('./services/notificationService');

// Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// SendGrid config
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('✅ SendGrid configured for email notifications');
} else {
    console.warn('⚠️ SENDGRID_API_KEY not found. Email notifications will not be sent.');
}

// Razorpay config
// Razorpay config
const razorpay = new Razorpay({
    key_id: 'rzp_test_RL5vMta3bKvRd4',
    key_secret: '9qxxugjEleGtcqcOjWFmCB2n'
});

// Upload images to Cloudinary
const uploadImage = async (file) => {
    try {
        console.log('=== UPLOAD IMAGE FUNCTION CALLED ===');
        console.log('Uploading image to Cloudinary:', file.originalname);

        // Determine file type
        const fileExtension = file.originalname.toLowerCase().split('.').pop();
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension);
        const isPdf = fileExtension === 'pdf';

        if (isPdf) {
            // Handle PDF uploads
            return await uploadDocument(file);
        }

        if (!isImage) {
            throw new Error('Only image files (JPG, PNG, GIF, WebP) are allowed for images');
        }

        // Upload to images folder with image resource type
        const uniqueId = `img-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const uploadOptions = {
            resource_type: 'image', // Use image resource type for images
            public_id: `lyvo-properties/images/${uniqueId}`, // Include folder in public_id
            overwrite: false,
            invalidate: true, // Invalidate CDN cache
            access_mode: 'public', // Make files publicly accessible
            use_filename: false, // Don't use original filename
            unique_filename: false, // We're setting our own public_id
            type: 'upload', // Explicitly set upload type
            sign_url: false // Don't sign URLs for public access
        };

        const result = await cloudinary.uploader.upload(file.path, uploadOptions);

        // Delete the local file after upload
        const fs = require('fs');
        try {
            fs.unlinkSync(file.path);
        } catch (deleteError) {
            console.log('Could not delete local file:', deleteError.message);
        }

        return {
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
            fileName: file.originalname
        };
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        return { success: false, error: error.message };
    }
};

// Upload PDF documents to Cloudinary
const uploadDocument = async (file) => {
    try {
        console.log('Uploading PDF to Cloudinary:', file.originalname);

        // Determine if it's a PDF
        const fileExtension = file.originalname.toLowerCase().split('.').pop();
        const isPdf = fileExtension === 'pdf';

        if (!isPdf) {
            throw new Error('Only PDF files are allowed for documents');
        }

        // Upload to dedicated PDF folder with raw resource type
        const uniqueId = `pdf-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const uploadOptions = {
            resource_type: 'raw', // Use raw resource type for proper PDF handling
            format: 'pdf',
            public_id: `lyvo-properties/pdfs/${uniqueId}`, // Include folder in public_id
            overwrite: false,
            invalidate: true, // Invalidate CDN cache
            access_mode: 'public', // Make files publicly accessible
            use_filename: false, // Don't use original filename
            unique_filename: false, // We're setting our own public_id
            type: 'upload', // Explicitly set upload type
            sign_url: false // Don't sign URLs for public access
        };

        const result = await cloudinary.uploader.upload(file.path, uploadOptions);

        // Delete the local file after upload
        const fs = require('fs');
        try {
            fs.unlinkSync(file.path);
        } catch (deleteError) {
            console.log('Could not delete local file:', deleteError.message);
        }

        return {
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
            fileName: file.originalname
        };
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        return { success: false, error: error.message };
    }
};

// Add Property
const addProperty = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        console.log('=== ADD PROPERTY REQUEST ===');

        // Parse propertyData from JSON string
        let propertyData;
        try {
            propertyData = JSON.parse(req.body.propertyData);
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Invalid property data format' });
        }

        // Validate required fields
        if (!propertyData || !propertyData.address) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Property data or address is missing' });
        }

        const userId = req.user?.id;
        if (!userId) {
            await session.abortTransaction();
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        // Upload images if provided
        let imageUrls = {};
        const roomsUploads = {};
        let dormitoryImages = [];
        let dormitoryToiletImage = null;

        if (req.files && Object.keys(req.files).length > 0) {
            // Convert req.files object to array of files
            const allFiles = [];
            Object.values(req.files).forEach(fileArray => {
                if (Array.isArray(fileArray)) {
                    allFiles.push(...fileArray);
                } else {
                    allFiles.push(fileArray);
                }
            });

            for (const file of allFiles) {
                try {
                    const uploadResult = await uploadImage(file);
                    if (uploadResult.success) {
                        // Handle different file types
                        if (file.fieldname === 'images') {
                            if (!imageUrls.gallery) imageUrls.gallery = [];
                            imageUrls.gallery.push(uploadResult.url);
                        } else if (/^rooms\[\d+\]\[(roomImage|toiletImage)\]$/.test(file.fieldname)) {
                            // Handle per-room uploads like rooms[0][roomImage]
                            const match = file.fieldname.match(/^rooms\[(\d+)\]\[(roomImage|toiletImage)\]$/);
                            const idx = parseInt(match[1]);
                            const key = match[2];
                            roomsUploads[idx] = roomsUploads[idx] || {};
                            roomsUploads[idx][key] = uploadResult.url;
                        } else if (file.fieldname === 'dormitoryImages') {
                            dormitoryImages.push(uploadResult.url);
                        } else if (file.fieldname === 'dormitoryToiletImage') {
                            dormitoryToiletImage = uploadResult.url;
                        } else if (file.fieldname === 'outsideToiletImage') {
                            imageUrls.outsideToiletImage = uploadResult.url;
                        } else if (file.fieldname === 'landTaxReceipt') {
                            imageUrls.landTaxReceipt = uploadResult.url;
                        } else {
                            imageUrls[file.fieldname] = uploadResult.url;
                        }
                    }
                } catch (uploadError) {
                    console.error('Upload error for file:', file.fieldname, uploadError);
                }
            }
        }

        // Create the main property document with proper validation
        const address = propertyData.address || {};
        const propertyDataToSave = {
            owner_id: userId,
            property_name: propertyData.propertyName || '',
            description: propertyData.description || '',
            property_mode: propertyData.propertyMode || 'room',
            address: {
                street: address.street || '',
                city: address.city || '',
                state: address.state || '',
                pincode: address.pincode || '',
                landmark: address.landmark || ''
            },
            latitude: parseFloat(address.latitude) || null,
            longitude: parseFloat(address.longitude) || null,
            security_deposit: parseFloat(propertyData.securityDeposit) || 0,
            amenities: propertyData.amenities || {},
            rules: propertyData.rules || {},
            images: {
                front: imageUrls.frontImage || null,
                back: imageUrls.backImage || null,
                hall: imageUrls.hallImage || null,
                kitchen: imageUrls.kitchenImage || null,
                gallery: imageUrls.gallery || []
            },
            toilet_outside: Boolean(propertyData.toiletOutside),
            outside_toilet_image: imageUrls.outsideToiletImage || null,
            land_tax_receipt: imageUrls.landTaxReceipt || null,
            status: 'active',
            approval_status: 'pending',
            approved: false,
            approved_at: null,
            approved_by: null
        };

        // Create the property
        const createdProperty = await Property.create([propertyDataToSave], { session });
        const propertyId = createdProperty[0]._id;

        // Handle room-based property (only room mode supported)
        const rooms = Array.isArray(propertyData.rooms) ? propertyData.rooms : [];
        const roomDocuments = rooms.map((room, index) => ({
            property_id: propertyId,
            room_number: parseInt(room.roomNumber) || (index + 1),
            room_type: room.roomType || '',
            room_size: parseInt(room.roomSize) || 0,
            bed_type: room.bedType || '',
            occupancy: parseInt(room.occupancy) || 1,
            rent: parseFloat(room.rent) || 0,
            amenities: room.amenities || {},
            description: room.description || '',
            room_image: roomsUploads[index]?.roomImage || null,
            toilet_image: roomsUploads[index]?.toiletImage || null,
            is_available: true
        }));

        if (roomDocuments.length > 0) {
            await Room.create(roomDocuments, { session });
        }

        // Commit the transaction
        await session.commitTransaction();

        res.status(201).json({
            success: true,
            message: 'Property added successfully',
            data: {
                property: createdProperty[0],
                mode: propertyData.propertyMode
            }
        });

    } catch (error) {
        console.error('Add property error:', error);
        await session.abortTransaction();
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    } finally {
        session.endSession();
    }
};

// Get owner's properties
const getProperties = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            console.log('Get Properties: No userId found in request');
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const ownerIdStr = String(userId);
        console.log(`Get Properties: Fetching for owner_id: ${ownerIdStr} (Original: ${userId})`);

        const properties = await Property.find({ owner_id: ownerIdStr })
            .sort({ createdAt: -1 })
            .lean();

        // Populate rooms for each property
        const propertiesWithRooms = await Promise.all(properties.map(async (property) => {
            const rooms = await Room.find({ property_id: property._id, status: { $ne: 'inactive' } });
            return { ...property, rooms };
        }));

        console.log(`Get Properties: Found ${propertiesWithRooms.length} properties for user ${ownerIdStr}`);

        res.json({
            success: true,
            data: propertiesWithRooms
        });

    } catch (error) {
        console.error('Get properties error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Get all properties for admin (with filtering)
const getAllPropertiesAdmin = async (req, res) => {
    try {
        console.log('Admin accessing properties...');
        const { status, approval_status, search } = req.query;

        const query = {};
        if (status) query.status = status;
        if (approval_status) query.approval_status = approval_status;

        if (search) {
            query.$or = [
                { property_name: { $regex: search, $options: 'i' } },
                { 'address.city': { $regex: search, $options: 'i' } }
            ];
        }

        console.log('Admin Property Query:', JSON.stringify(query));
        const properties = await Property.find(query).sort({ created_at: -1 });
        console.log(`Found ${properties.length} properties for admin`);

        // Enrich with owner details
        // Filter out invalid or null owner IDs to prevent CastError
        const ownerIds = [...new Set(properties
            .map(p => p.owner_id)
            .filter(id => id && mongoose.Types.ObjectId.isValid(id))
        )];

        const owners = await User.find({ _id: { $in: ownerIds } }).select('name email phone phoneNumber');

        const userMap = {};
        owners.forEach(owner => {
            if (owner && owner._id) {
                userMap[owner._id.toString()] = owner;
            }
        });

        // Enrich with Rooms
        const propertyIds = properties.map(p => p._id);
        const allRooms = await Room.find({ property_id: { $in: propertyIds } });

        const roomMap = {};
        allRooms.forEach(room => {
            if (room && room.property_id) {
                const pId = room.property_id.toString();
                if (!roomMap[pId]) roomMap[pId] = [];
                roomMap[pId].push(room);
            }
        });

        const enrichedProperties = properties.map(p => {
            const owner = userMap[p.owner_id?.toString()] || {};
            const rooms = roomMap[p._id.toString()] || [];

            return {
                ...p.toObject(),
                rooms: rooms,
                owner: {
                    name: owner.name || 'Unknown',
                    email: owner.email || '',
                    phone: owner.phone || owner.phoneNumber || ''
                }
            };
        });

        res.json({
            success: true,
            data: enrichedProperties
        });
    } catch (error) {
        console.error('Admin get properties error details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Admin approve/reject property
const approvePropertyAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body; // status: 'approved' or 'rejected'
        const adminId = req.user?.id || req.headers['x-user-id'];

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid property ID' });
        }

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const property = await Property.findById(id);
        if (!property) {
            return res.status(404).json({ success: false, message: 'Property not found' });
        }

        property.approval_status = status;
        property.approved = status === 'approved';
        if (status === 'approved') {
            property.approved_at = new Date();
            property.approved_by = adminId;
            property.status = 'active';
        } else {
            property.status = 'inactive';
        }

        await property.save();

        // Send notifications
        try {
            if (status === 'approved') {
                await NotificationService.notifyPropertyApproval(property, adminId);
            } else {
                await NotificationService.notifyPropertyRejection(property, adminId, reason);
            }
        } catch (notifError) {
            console.error('Notification error (non-fatal):', notifError);
        }

        res.json({
            success: true,
            message: `Property ${status} successfully`,
            data: property
        });

    } catch (error) {
        console.error('Approve property error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Admin approve/reject room
const approveRoomAdmin = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { status, reason } = req.body;
        const adminId = req.user?.id || req.headers['x-user-id'];

        if (!mongoose.Types.ObjectId.isValid(roomId)) {
            return res.status(400).json({ success: false, message: 'Invalid room ID' });
        }

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const room = await Room.findById(roomId);
        if (!room) {
            return res.status(404).json({ success: false, message: 'Room not found' });
        }

        const property = await Property.findById(room.property_id);

        room.approval_status = status;
        room.approved = status === 'approved';
        if (status === 'approved') {
            room.approved_at = new Date();
            room.approved_by = adminId;
            room.status = 'active'; // Make it active as well
        }

        await room.save();

        // Notify owner
        try {
            if (property) {
                if (status === 'approved') {
                    await NotificationService.notifyRoomApproval(room, property, adminId);
                } else {
                    await NotificationService.notifyRoomRejection(room, property, adminId, reason);
                }
            }
        } catch (notifError) {
            console.error('Room notification error (non-fatal):', notifError);
        }

        res.json({
            success: true,
            message: `Room ${status} successfully`,
            data: room
        });

    } catch (error) {
        console.error('Approve room error details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Send admin message to owner
const sendAdminMessage = async (req, res) => {
    try {
        const { propertyId, message } = req.body;
        const adminId = req.user?.id || req.headers['x-user-id'];

        if (!mongoose.Types.ObjectId.isValid(propertyId)) {
            return res.status(400).json({ success: false, message: 'Invalid property ID' });
        }

        const property = await Property.findById(propertyId);
        if (!property) {
            return res.status(404).json({ success: false, message: 'Property not found' });
        }

        await NotificationService.sendAdminMessageToOwner(
            property.owner_id,
            property._id,
            property.property_name,
            message,
            adminId
        );

        res.json({ success: true, message: 'Message sent successfully' });

    } catch (error) {
        console.error('Send admin message error details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get single property details (owner view)
const getProperty = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        const property = await Property.findOne({ _id: id, owner_id: userId });

        if (!property) {
            return res.status(404).json({ success: false, message: 'Property not found' });
        }

        // Fetch associated rooms
        const rooms = await Room.find({ property_id: id }).lean();

        // Get confirmed bookings for this property to count occupants
        const Booking = require('./models/Booking');
        const activeBookings = await Booking.find({
            propertyId: id,
            status: { $in: ['confirmed', 'checked_in', 'approved'] },
            isDeleted: false
        });

        // Add occupant count to each room
        const roomsWithOccupancy = rooms.map(room => {
            const roomBookings = activeBookings.filter(b => b.roomId.toString() === room._id.toString());
            return {
                ...room,
                current_occupants: roomBookings.length
            };
        });

        res.json({
            success: true,
            data: {
                ...property.toObject(),
                rooms: roomsWithOccupancy
            }
        });

    } catch (error) {
        console.error('Get property error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Get single property details (admin view)
const getPropertyAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid property ID' });
        }

        const property = await Property.findById(id);

        if (!property) {
            return res.status(404).json({ success: false, message: 'Property not found' });
        }

        // Fetch owner details
        let owner = null;
        if (property.owner_id && mongoose.Types.ObjectId.isValid(property.owner_id)) {
            owner = await User.findById(property.owner_id).select('name email phone phoneNumber profilePicture isVerified role createdAt');
        }

        // Fetch rooms
        const rooms = await Room.find({ property_id: id }).lean();

        // Get confirmed bookings for this property to count occupants
        const Booking = require('./models/Booking');
        const activeBookings = await Booking.find({
            propertyId: id,
            status: { $in: ['confirmed', 'checked_in', 'approved'] },
            isDeleted: false
        });

        // Add occupant count to each room
        const roomsWithOccupancy = rooms.map(room => {
            const roomBookings = activeBookings.filter(b => b.roomId.toString() === room._id.toString());
            return {
                ...room,
                current_occupants: roomBookings.length
            };
        });

        res.json({
            success: true,
            data: {
                ...property.toObject(),
                owner: {
                    _id: owner?._id,
                    name: owner?.name || 'Unknown',
                    email: owner?.email || '',
                    phone: owner?.phone || owner?.phoneNumber || 'Not provided',
                    profilePicture: owner?.profilePicture,
                    isVerified: owner?.isVerified || false,
                    role: owner?.role,
                    createdAt: owner?.createdAt
                },
                rooms: roomsWithOccupancy
            }
        });

    } catch (error) {
        console.error('Get property admin error details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Admin delete room
const deleteRoomAdmin = async (req, res) => {
    try {
        const { roomId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(roomId)) {
            return res.status(400).json({ success: false, message: 'Invalid room ID' });
        }

        const room = await Room.findByIdAndDelete(roomId);

        if (!room) {
            return res.status(404).json({ success: false, message: 'Room not found' });
        }

        res.json({ success: true, message: 'Room deleted successfully', data: { roomId } });
    } catch (error) {
        console.error('Delete room admin error details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Admin delete property (and associated rooms)
const deletePropertyAdmin = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Invalid property ID' });
        }

        const property = await Property.findById(id).session(session);
        if (!property) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: 'Property not found' });
        }

        // Delete all rooms associated with this property
        await Room.deleteMany({ property_id: id }).session(session);

        // Delete the property
        await Property.findByIdAndDelete(id).session(session);

        await session.commitTransaction();

        res.json({ success: true, message: 'Property and associated rooms deleted successfully', data: { propertyId: id } });

    } catch (error) {
        await session.abortTransaction();
        console.error('Delete property admin error details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        session.endSession();
    }
};

// Get properties for public view (seekers)
const getApprovedPropertiesPublic = async (req, res) => {
    try {
        const { search, minPrice, maxPrice, propertyType, amenities } = req.query;

        // Base query: only approved properties and rooms
        let query = {
            approved: true,
            status: 'active'
        };

        // Advanced filtering
        if (search) {
            query.$or = [
                { property_name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { 'address.city': { $regex: search, $options: 'i' } },
                { 'address.street': { $regex: search, $options: 'i' } }
            ];
        }

        if (propertyType) {
            query.property_mode = propertyType;
        }

        // Since amenities are booleans or objects, filtering by them requires dynamic query construction
        if (amenities) {
            // Assuming amenities is a comma-separated list like 'wifi,ac,parking'
            const amenitiesList = amenities.split(',');
            amenitiesList.forEach(amenity => {
                // Map common amenity names to schema fields if needed
                if (amenity === 'parking') {
                    query.$or = [
                        { 'amenities.parking4w': true },
                        { 'amenities.parking2w': true }
                    ];
                } else {
                    query[`amenities.${amenity}`] = true;
                }
            });
        }

        // Find properties matching criteria
        const properties = await Property.find(query).sort({ created_at: -1 });

        // Now filter by room price if needed, or just attach minimum room price
        const enrichedProperties = await Promise.all(properties.map(async (property) => {
            // Find active rooms for this property
            const roomQuery = {
                property_id: property._id,
                is_available: true,
                approved: true,
                status: 'active'
            };

            if (minPrice || maxPrice) {
                roomQuery.rent = {};
                if (minPrice) roomQuery.rent.$gte = Number(minPrice);
                if (maxPrice) roomQuery.rent.$lte = Number(maxPrice);
            }

            const rooms = await Room.find(roomQuery);

            // If filtering by price and no rooms match, return null to filter out property
            if ((minPrice || maxPrice) && rooms.length === 0) {
                return null;
            }

            // Find min and max rent
            const rents = rooms.map(r => r.rent);
            const minRent = rents.length > 0 ? Math.min(...rents) : 0;
            const maxRent = rents.length > 0 ? Math.max(...rents) : 0;

            // Compatibility Scoring (Summary for Dashboard)
            let bestMatchScore = null;
            const seekerId = req.user?.id;

            if (seekerId) {
                try {
                    const seekerAnswers = await BehaviourAnswers.findOne({ userId: seekerId });
                    const seeker = await User.findById(seekerId);

                    if (seekerAnswers && seeker) {
                        const seekerProfile = {
                            gender: seeker.gender,
                            age: seeker.age,
                            lifestyle: seekerAnswers.answers
                        };

                        const roomScores = await Promise.all(rooms.map(async (room) => {
                            // Get active tenants
                            const tenants = await Tenant.find({
                                roomId: room._id,
                                status: 'active',
                                isDeleted: { $ne: true }
                            }).populate('userId');

                            if (tenants.length === 0) return 100; // Empty room = 100% potential

                            const formattedTenants = await Promise.all(tenants.map(async (t) => {
                                const tAnswers = await BehaviourAnswers.findOne({ userId: t.userId._id });
                                return {
                                    userId: t.userId._id,
                                    name: t.userName || t.userId.name,
                                    gender: t.userId.gender,
                                    age: t.userId.age,
                                    lifestyle: tAnswers ? tAnswers.answers : {}
                                };
                            }));

                            const comp = await CompatibilityEngine.evaluateRoom(seekerProfile, formattedTenants, { skipAI: true });
                            return comp.overallScore;
                        }));

                        if (roomScores.length > 0) {
                            bestMatchScore = Math.max(...roomScores);
                        }
                    }
                } catch (err) {
                    console.error("Error calculating bulk compatibility:", err);
                }
            }

            return {
                ...property.toObject(),
                rooms_count: rooms.length,
                min_rent: minRent,
                max_rent: maxRent,
                available_rooms: rooms.length, // only available approved rooms
                matchScore: bestMatchScore, // Add best match score
                room_details: rooms.map(r => ({
                    room_number: r.room_number,
                    room_type: r.room_type,
                    occupancy: r.occupancy,
                    rent: r.rent
                }))
            };
        }));

        // Filter out nulls (properties with no matching rooms if price filter applied)
        const finalProperties = enrichedProperties.filter(Boolean);

        // Fetch owner details in batch
        const ownerIds = [...new Set(finalProperties.map(p => p.owner_id))];
        const User = require('../user/model');
        const owners = await User.find({ _id: { $in: ownerIds } }).select('name email phone phoneNumber picture');

        const userMap = {};
        owners.forEach(owner => {
            userMap[owner._id.toString()] = owner;
        });

        const populatedProperties = finalProperties.map(p => ({
            ...p,
            owner: userMap[p.owner_id] || { name: 'Verified Owner' }
        }));

        res.json({
            success: true,
            count: populatedProperties.length,
            data: populatedProperties
        });

    } catch (error) {
        console.error('Public get properties error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Get single property public view
const getApprovedPropertyPublic = async (req, res) => {
    try {
        const { id } = req.params;

        const property = await Property.findOne({
            _id: id,
            approved: true,
            status: 'active'
        }).lean();

        if (!property) {
            return res.status(404).json({ success: false, message: 'Property not found' });
        }

        // Populate Owner Details (manually or via populate if schema supports reference)
        // Using manual fetch to be safe and explicit with fields
        const User = require('../user/model');
        const owner = await User.findById(property.owner_id).select('name email phone phoneNumber picture profilePicture');

        const propertyWithDetails = {
            ...property,
            ownerDetails: owner ? {
                name: owner.name,
                email: owner.email,
                phone: owner.phone || owner.phoneNumber,
                profilePicture: owner.picture || owner.profilePicture
            } : null
        };

        // Get available rooms
        const rooms = await Room.find({
            property_id: id,
            approved: true,
            status: 'active'
            // is_available: true // Removed to show all rooms (frontend handles availability status)
        }).lean(); // Use lean() to allow adding properties

        // Get confirmed bookings for this property to count occupants
        const Booking = require('./models/Booking');
        const activeBookings = await Booking.find({
            propertyId: id,
            status: { $in: ['confirmed', 'checked_in', 'approved'] },
            isDeleted: false
        });

        // Add occupant count to each room
        const roomsWithOccupancy = rooms.map(room => {
            const roomBookings = activeBookings.filter(b => b.roomId.toString() === room._id.toString());
            return {
                ...room,
                current_occupants: roomBookings.length
            };
        });

        // remove redundant existing owner fetch if present
        // const User = require('../user/model');
        // const owner = await User.findById(property.owner_id).select('name picture phone created_at');

        // Calculate compatibility for each room if seekerId is present
        let roomsWithCompatibility = roomsWithOccupancy;
        const seekerId = req.user?.id;

        if (seekerId) {
            try {
                const seekerAnswers = await BehaviourAnswers.findOne({ userId: seekerId });
                const seeker = await User.findById(seekerId);

                if (seekerAnswers && seeker) {
                    const seekerProfile = {
                        gender: seeker.gender,
                        age: seeker.age,
                        lifestyle: seekerAnswers.answers
                    };

                    roomsWithCompatibility = await Promise.all(roomsWithOccupancy.map(async (room) => {
                        // Get active tenants for this room
                        const tenants = await Tenant.find({
                            roomId: room._id,
                            status: 'active',
                            isDeleted: { $ne: true }
                        }).populate('userId');

                        if (tenants.length === 0) return { ...room, compatibility: { overallScore: 100, label: "Fresh Start" } };

                        const formattedTenants = await Promise.all(tenants.map(async (t) => {
                            const tAnswers = await BehaviourAnswers.findOne({ userId: t.userId._id });
                            return {
                                userId: t.userId._id,
                                name: t.userName || t.userId.name,
                                gender: t.userId.gender,
                                age: t.userId.age,
                                lifestyle: tAnswers ? tAnswers.answers : {}
                            };
                        }));

                        const compData = await CompatibilityEngine.evaluateRoom(seekerProfile, formattedTenants);
                        return { ...room, compatibility: compData };
                    }));
                }
            } catch (err) {
                console.error('Compatibility Engine Error (getApprovedPropertyPublic):', err);
            }
        }

        // --- PROPERTY LEVEL COMPATIBILITY (HOUSE VIBE) ---
        let propertyCompatibility = null;
        let allResidents = [];



        try {
            // 1. Get ALL active tenants in the property (ALWAYS, for "Meet the Flatmates")
            const propertyTenants = await Tenant.find({
                propertyId: id,
                status: 'active',
                isDeleted: { $ne: true }
            }).populate('userId');

            if (propertyTenants.length > 0) {
                // Deduplicate tenants by userId
                const uniqueTenants = [];
                const seenUserIds = new Set();

                propertyTenants.forEach(t => {
                    if (t.userId && !seenUserIds.has(t.userId._id.toString())) {
                        seenUserIds.add(t.userId._id.toString());
                        uniqueTenants.push(t);
                    }
                });

                console.log('DEBUG: Raw Tenants:', propertyTenants.length);
                console.log('DEBUG: Deduplicated Tenants:', uniqueTenants.length);

                const formattedPropertyTenants = await Promise.all(uniqueTenants.map(async (t) => {
                    const tAnswers = await BehaviourAnswers.findOne({ userId: t.userId._id });
                    return {
                        userId: t.userId._id,
                        name: t.userName || t.userId.name,
                        gender: t.userId.gender,
                        age: t.userId.age,
                        lifestyle: tAnswers ? tAnswers.answers : {},
                        profilePicture: t.userId.profilePicture
                    };
                }));

                allResidents = formattedPropertyTenants;

                // 2. Calculate Score (ONLY if Seeker is logged in)
                if (seekerId) {
                    const seekerAnswers = await BehaviourAnswers.findOne({ userId: seekerId });
                    const seeker = await User.findById(seekerId);
                    console.log('DEBUG: Seeker ID:', seekerId);

                    if (seekerAnswers && seeker) {
                        const seekerProfile = {
                            gender: seeker.gender,
                            age: seeker.age,
                            lifestyle: seekerAnswers.answers
                        };

                        // Overall Score
                        propertyCompatibility = await CompatibilityEngine.evaluateRoom(seekerProfile, formattedPropertyTenants);
                        console.log('DEBUG: House Vibe Score:', propertyCompatibility ? propertyCompatibility.overallScore : 'null');

                        // Individual Scores (for each resident)
                        for (const t of formattedPropertyTenants) {
                            // Create a temp tenant object with just required fields for the engine if needed, 
                            // but formattedPropertyTenants structure matches what evaluateRoom expects (array of objects with lifestyle).
                            const singleMatch = await CompatibilityEngine.evaluateRoom(seekerProfile, [t]);
                            t.matchScore = singleMatch.overallScore;
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Property Compatibility Error:', err);
        }
        // --- END PROPERTY LEVEL COMPATIBILITY ---
        // --- END PROPERTY LEVEL COMPATIBILITY ---

        res.json({
            success: true,
            data: {
                ...propertyWithDetails,
                rooms: roomsWithCompatibility,
                house_vibe: propertyCompatibility,
                current_residents: allResidents
            }
        });

    } catch (error) {
        console.error('Public get property error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Update Room Status
const updateRoomStatus = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { is_available } = req.body;
        const userId = req.user?.id;

        const room = await Room.findById(roomId);
        if (!room) return res.status(404).json({ message: 'Room not found' });

        // Verify ownership via Property
        const property = await Property.findById(room.property_id);
        if (!property || property.owner_id !== userId) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        room.is_available = is_available;

        // If setting to available, ensure room_status is also available
        if (is_available && room.status === 'active') {
            room.room_status = 'available';
        } else if (!is_available) {
            // If explicitly marking unavailable, maybe maintenance or full?
            // Keep it simple for now, just toggle availability flag
        }

        await room.save();

        res.json({ success: true, data: room });
    } catch (error) {
        console.error('Update room status error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Update Room Details
const updateRoom = async (req, res) => {
    try {
        const { roomId } = req.params;
        const updates = req.body;
        const userId = req.user?.id;

        // Handle uploaded files
        if (req.files) {
            if (req.files.roomImage && req.files.roomImage[0]) {
                const result = await uploadImage(req.files.roomImage[0]);
                if (result.success) updates.room_image = result.url;
            }
            if (req.files.toiletImage && req.files.toiletImage[0]) {
                const result = await uploadImage(req.files.toiletImage[0]);
                if (result.success) updates.toilet_image = result.url;
            }
        }

        const room = await Room.findById(roomId);
        if (!room) return res.status(404).json({ message: 'Room not found' });

        const property = await Property.findById(room.property_id);
        if (!property || property.owner_id !== userId) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        // Prevent updating sensitive fields directly if needed
        delete updates.approved;
        delete updates.approval_status;
        delete updates.property_id;

        Object.assign(room, updates);
        await room.save();

        res.json({ success: true, data: room });

    } catch (error) {
        console.error('Update room error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get single room public
const getRoomPublic = async (req, res) => {
    try {
        const { roomId } = req.params;
        const room = await Room.findById(roomId).populate('property_id');

        if (!room || !room.property_id) { // Removing strict approved check for debugging if needed, but keeping it for production logic?
            // User requested premium view, let's keep it safe but robust.
            // If property is not approved, maybe we shouldn't show it?
            // The original code had !room.property_id.approved. Let's keep it or relax it?
            // For now, let's keep it safe.
            return res.status(404).json({ success: false, message: 'Room not found' });
        }

        // Use existing approval logic if necessary, but be careful if data is messy. 
        // Original: if (!room || !room.property_id.approved)
        if (room.property_id.approved === false) {
            // return res.status(404).json({ success: false, message: 'Room not found (not approved)' });
        }

        const property = room.property_id;
        let owner = null;
        if (property.owner_id) {
            try {
                owner = await User.findById(property.owner_id).select('name email phone profilePicture bio location role');
            } catch (err) {
                console.error('Error fetching owner for room public:', err);
            }
        }

        // --- Compatibility & Residents Logic ---
        let compatibilityData = null;
        let formattedTenants = [];
        const seekerId = req.user?.id;

        try {
            // 1. Get all active tenants in this room (ALWAYS)
            const tenants = await Tenant.find({
                roomId: room._id,
                status: 'active',
                isDeleted: { $ne: true }
            }).populate('userId');

            // Format tenants
            formattedTenants = await Promise.all(tenants.map(async (t) => {
                const tAnswers = await BehaviourAnswers.findOne({ userId: t.userId._id });
                return {
                    userId: t.userId._id,
                    name: t.userName || t.userId.name,
                    gender: t.userId.gender,
                    age: t.userId.age,
                    lifestyle: tAnswers ? tAnswers.answers : {},
                    profilePicture: t.userId.profilePicture,
                    joinedAt: t.userId.createdAt
                };
            }));

            // Deduplicate tenants by userId to prevent multiple active lease records for same person showing up twice
            const seenIds = new Set();
            formattedTenants = formattedTenants.filter(t => {
                const id = t.userId.toString();
                if (seenIds.has(id)) return false;
                seenIds.add(id);
                return true;
            });

            // 2. Calculate Scores (If Seeker Logged In)
            if (seekerId) {
                const seekerAnswers = await BehaviourAnswers.findOne({ userId: seekerId });
                const seeker = await User.findById(seekerId);

                if (seekerAnswers && seeker) {
                    const seekerProfile = {
                        gender: seeker.gender,
                        age: seeker.age,
                        lifestyle: seekerAnswers.answers
                    };

                    // Overall Score
                    compatibilityData = await CompatibilityEngine.evaluateRoom(seekerProfile, formattedTenants);

                    // Individual Scores
                    for (const t of formattedTenants) {
                        const singleMatch = await CompatibilityEngine.evaluateRoom(seekerProfile, [t]);
                        t.matchScore = singleMatch.overallScore;
                    }
                }
            }
        } catch (err) {
            console.error('Compatibility Engine Error (getRoomPublic):', err);
        }

        res.json({
            success: true,
            data: {
                room: room,
                property: property,
                owner: owner,
                compatibility: compatibilityData,
                residents: formattedTenants
            }
        });
    } catch (error) {
        console.error('Get public room error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Debug: Get all rooms
const getAllRoomsDebug = async (req, res) => {
    try {
        const rooms = await Room.find().limit(50);
        res.json(rooms);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Payment: Create Order
const createPaymentOrder = async (req, res) => {
    try {
        console.log('API: createPaymentOrder called');
        const { amount, currency = 'INR', receipt_id } = req.body;
        console.log('Request Request Body:', req.body);

        if (!amount) {
            console.log('Error: Amount missing');
            return res.status(400).json({ success: false, message: 'Amount is required' });
        }

        const options = {
            amount: Math.round(amount * 100), // convert to paise
            currency,
            receipt: receipt_id || `receipt_${Date.now()}`,
            payment_capture: 1
        };
        console.log('Razorpay Options:', options);

        try {
            // Verify razorpay instance exists
            if (!razorpay) throw new Error('Razorpay instance not initialized');

            const order = await razorpay.orders.create(options);
            console.log('Razorpay Order Created:', order);

            res.json({
                success: true,
                order_id: order.id,
                amount: order.amount,
                currency: order.currency
            });
        } catch (rzpError) {
            console.error('Razorpay Internal Error:', rzpError);
            throw rzpError; // Re-throw to outer catch
        }

    } catch (error) {
        console.error('Razorpay order error (Outer):', error);
        res.status(500).json({
            success: false,
            message: 'Payment initiation failed',
            details: error.message,
            stack: error.stack
        });
    }
};

// Payment: Verify and Create Booking
const verifyPaymentAndCreateBooking = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            bookingDetails
        } = req.body;

        // 1. Verify Signature
        const crypto = require('crypto');
        const secret = '9qxxugjEleGtcqcOjWFmCB2n';
        const generated_signature = crypto
            .createHmac('sha256', secret)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        // 2. Create Booking
        const { propertyId, roomId, userId, amount, securityDeposit, monthlyRent } = bookingDetails;

        // Fetch details for snapshots
        const property = await Property.findById(propertyId);
        const room = await Room.findById(roomId);

        const User = require('../user/model');
        const user = await User.findById(userId);

        let owner = null;
        try {
            owner = await User.findById(property.owner_id);
        } catch (e) {
            console.log('Error fetching owner (id format):', e.message);
        }

        if (!property || !room || !user) {
            throw new Error('One or more entities not found during booking creation');
        }

        const booking = new Booking({
            userId,
            ownerId: property.owner_id,
            propertyId,
            roomId,
            status: 'pending_approval',
            payment: {
                totalAmount: monthlyRent + securityDeposit,
                securityDeposit,
                monthlyRent,
                bookingFeePaid: amount,
                razorpayOrderId: razorpay_order_id,
                razorpayPaymentId: razorpay_payment_id,
                razorpaySignature: razorpay_signature,
                paymentStatus: 'completed',
                paidAt: new Date()
            },
            userSnapshot: {
                name: user.name,
                email: user.email,
                phone: user.phone || user.phoneNumber,
                profilePicture: user.profilePicture
            },
            ownerSnapshot: owner ? {
                name: owner.name,
                email: owner.email,
                phone: owner.phone || owner.phoneNumber
            } : { name: 'Unknown', email: '', phone: '' },
            propertySnapshot: {
                name: property.property_name,
                address: property.address,
                latitude: property.latitude,
                longitude: property.longitude,
                security_deposit: property.security_deposit,
                images: property.images
            },
            roomSnapshot: {
                roomNumber: room.room_number,
                roomType: room.room_type,
                roomSize: room.room_size,
                bedType: room.bed_type,
                occupancy: room.occupancy,
                rent: room.rent,
                amenities: room.amenities,
                images: {
                    room: room.room_image,
                    toilet: room.toilet_image
                }
            }
        });

        await booking.save();

        // Notification to Owner
        try {
            await NotificationService.notifyBookingRequest(booking, property, userId);
        } catch (notifError) {
            console.error('Failed to send booking notification:', notifError);
        }

        res.json({
            success: true,
            message: 'Booking created successfully',
            bookingId: booking._id
        });

        // Update occupancy (though usually pending doesn't block, but if payment_completed/approved it might)
        if (booking.status === 'approved' || booking.payment?.paymentStatus === 'completed') {
            await updateRoomOccupancyStatus(roomId);
        }

    } catch (error) {
        console.error('Booking creation error:', error);
        res.status(500).json({ success: false, message: 'Booking failed after payment', error: error.message });
    }
};

// Create booking (manual/public endpoint)
const createBookingPublic = async (req, res) => {
    try {
        const { propertyId, roomId, userId, amount, securityDeposit } = req.body;

        const User = require('../user/model');
        const user = await User.findById(userId);
        const property = await Property.findById(propertyId);
        const room = await Room.findById(roomId);

        if (!user || !property || !room) {
            return res.status(404).json({ message: 'Resource not found' });
        }

        let owner = null;
        try {
            owner = await User.findById(property.owner_id);
        } catch (e) {
            console.log('Error fetching owner (manual booking):', e.message);
        }

        const booking = new Booking({
            userId,
            ownerId: property.owner_id,
            propertyId,
            roomId,
            status: 'pending_approval',
            payment: {
                totalAmount: amount,
                securityDeposit: securityDeposit || 0,
                monthlyRent: room.rent,
                paymentStatus: 'pending' // Manual booking usually implies payment is pending
            },
            userSnapshot: {
                name: user.name,
                email: user.email,
                phone: user.phone || user.phoneNumber
            },
            ownerSnapshot: owner ? {
                name: owner.name,
                email: owner.email,
                phone: owner.phone || owner.phoneNumber
            } : { name: 'Unknown', email: '', phone: '' },
            propertySnapshot: {
                name: property.property_name,
                address: property.address,
                security_deposit: property.security_deposit
            },
            roomSnapshot: {
                roomNumber: room.room_number,
                roomType: room.room_type,
                rent: room.rent
            }
        });

        await booking.save();

        // Notification
        try {
            await NotificationService.notifyBookingRequest(booking, property, userId);
        } catch (notifError) {
            console.error('Notification error:', notifError);
        }

        res.json({ success: true, booking });
    } catch (error) {
        console.error('Create booking public error:', error);
        res.status(500).json({ error: error.message });
    }
};

// List owner's bookings
const listOwnerBookings = async (req, res) => {
    try {
        const ownerId = req.user?.id;
        const { status } = req.query;

        // Ensure ownerId is String for query
        const query = { ownerId: String(ownerId), isDeleted: { $ne: true } };
        if (status) query.status = status;

        const bookings = await Booking.find(query).sort({ createdAt: -1 });

        res.json({ success: true, bookings });
    } catch (error) {
        console.error('List owner bookings error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get pending approval bookings (for owner dashboard)
const getPendingApprovalBookings = async (req, res) => {
    try {
        const ownerId = req.user?.id;
        const bookings = await Booking.find({
            ownerId,
            status: 'pending_approval',
            isDeleted: { $ne: true }
        }).sort({ createdAt: -1 });

        res.json({ success: true, bookings });
    } catch (error) {
        console.error('Get pending bookings error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Check if user has bookings for a property
const checkUserBookingStatus = async (req, res) => {
    try {
        const { propertyId } = req.query;
        const userId = req.user?.id;

        const booking = await Booking.findOne({
            userId,
            propertyId,
            status: { $in: ['confirmed', 'payment_completed', 'pending_approval', 'approved'] },
            isDeleted: { $ne: true }
        });

        res.json({
            hasBooking: !!booking,
            status: booking?.status
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get user's bookings (Seeker)
const getUserBookings = async (req, res) => {
    try {
        const userId = req.user?.id;
        // Populate room/property just in case snapshots are insufficient, but snapshots should be used
        const bookings = await Booking.find({
            userId,
            isDeleted: { $ne: true }
        }).populate('propertyId roomId').sort({ createdAt: -1 });

        res.json({ success: true, bookings });
    } catch (error) {
        console.error('Get user bookings error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get booking details (protected)
const getBookingDetails = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const userId = req.user?.id;

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });

        // Access control: User or Owner
        if (booking.userId.toString() !== userId && booking.ownerId.toString() !== userId) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        res.json({ success: true, booking });
    } catch (error) {
        console.error('Get booking details error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Public booking details (for checkout flow maybe?)
const getBookingDetailsPublic = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        res.json({ success: true, booking });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update booking status (approve/reject/etc)
const updateBookingStatus = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { status, rejectionReason } = req.body;
        const ownerId = req.user?.id;

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });

        if (booking.ownerId.toString() !== ownerId) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const oldStatus = booking.status;
        booking.status = status;

        if (status === 'approved') {
            booking.approvedAt = new Date();
            booking.approvedBy = ownerId;

            // Send Notification
            const property = await Property.findById(booking.propertyId);
            const room = await Room.findById(booking.roomId);
            await NotificationService.notifyBookingApproval(booking, property, room, ownerId);

            // [NOTE] Tenant record is now created during finalize-check-in, not on approval.

        } else if (status === 'rejected') {
            booking.cancellationReason = rejectionReason;
            booking.cancelledBy = 'owner';
            booking.cancelledAt = new Date();

            const property = await Property.findById(booking.propertyId);
            const room = await Room.findById(booking.roomId);
            await NotificationService.notifyBookingRejection(booking, property, room, ownerId, rejectionReason);
        }

        await booking.save();

        // Update room occupancy based on new status
        await updateRoomOccupancyStatus(booking.roomId);

        res.json({ success: true, message: `Booking ${status}`, booking });

    } catch (error) {
        console.error('Update booking status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Cancel booking
const cancelAndDeleteBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const userId = req.user?.id;

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });

        if (booking.userId.toString() !== userId && booking.ownerId.toString() !== userId) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        booking.status = 'cancelled';
        booking.isDeleted = true;
        booking.deletedAt = new Date();
        booking.cancelledBy = booking.userId.toString() === userId ? 'user' : 'owner';
        booking.cancelledAt = new Date();

        await booking.save();

        // Update occupancy (frees up space)
        await updateRoomOccupancyStatus(booking.roomId);

        res.json({ success: true, message: 'Booking cancelled' });

    } catch (error) {
        console.error('Cancel booking error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


// Finalize check-in and create tenant record
const finalizeCheckIn = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const ownerId = req.user?.id;

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        if (booking.ownerId.toString() !== ownerId) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        if (booking.status === 'checked_in') {
            return res.status(400).json({ success: false, message: 'User already checked in' });
        }

        // 1. Update Booking Status
        booking.status = 'checked_in';
        booking.actualCheckInDate = new Date();
        await booking.save();

        // 2. Create Tenant Record
        const tenant = new Tenant({
            userId: booking.userId,
            userName: booking.userSnapshot.name,
            userEmail: booking.userSnapshot.email,
            userPhone: booking.userSnapshot.phone,
            profilePicture: booking.userSnapshot.profilePicture,
            propertyId: booking.propertyId,
            propertyName: booking.propertySnapshot.name,
            roomId: booking.roomId,
            roomNumber: booking.roomSnapshot.roomNumber,
            ownerId: booking.ownerId,
            ownerName: booking.ownerSnapshot.name,
            ownerEmail: booking.ownerSnapshot.email,
            ownerPhone: booking.ownerSnapshot.phone,
            bookingId: booking._id,
            paymentId: booking.payment.razorpayPaymentId,
            amountPaid: booking.payment.totalAmount,
            checkInDate: booking.checkInDate || new Date(),
            actualCheckInDate: new Date(),
            monthlyRent: booking.payment.monthlyRent,
            securityDeposit: booking.payment.securityDeposit,
            status: 'active'
        });
        await tenant.save();

        // Update room occupancy status
        await updateRoomOccupancyStatus(booking.roomId);

        res.json({
            success: true,
            message: 'Check-in finalized and tenant record created',
            booking,
            tenant
        });

    } catch (error) {
        console.error('Finalize check-in error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Lookup booking by payment/order ID
const lookupBookingDetails = async (req, res) => {
    try {
        const { orderId, paymentId } = req.query;
        const query = {};
        if (orderId) query['payment.razorpayOrderId'] = orderId;
        if (paymentId) query['payment.razorpayPaymentId'] = paymentId;

        const booking = await Booking.findOne(query);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });

        res.json({ success: true, booking });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Favorites
const addFavorite = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { propertyId, roomId } = req.body;

        const existing = await Favorite.findOne({ userId, propertyId, roomId });
        if (existing) return res.json({ success: true, favorite: existing });

        const favorite = await Favorite.create({ userId, propertyId, roomId });
        res.json({ success: true, favorite });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const removeFavorite = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { propertyId, roomId } = req.body;

        await Favorite.deleteOne({ userId, propertyId, roomId });
        res.json({ success: true, message: 'Removed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getUserFavorites = async (req, res) => {
    try {
        const userId = req.user?.id;
        const favorites = await Favorite.find({ userId })
            .populate({
                path: 'propertyId',
                populate: { path: 'owner_id', select: 'name email phone phoneNumber profilePicture' }
            })
            .populate('roomId');

        // Enrich with property details if populate fails or need more info
        // (Populate should work since we have models in same process)

        res.json({ success: true, favorites });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const checkFavoriteStatus = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { propertyId, roomId } = req.query;
        const fav = await Favorite.findOne({ userId, propertyId, roomId });
        res.json({ isFavorite: !!fav });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Create missing tenant records (maintenance util)
const createMissingTenantRecords = async (req, res) => {
    try {
        const bookings = await Booking.find({ status: 'confirmed' });
        let count = 0;
        for (const booking of bookings) {
            const exists = await Tenant.findOne({ bookingId: booking._id });
            if (!exists) {
                // ... logic similar to updateBookingStatus ...
                // Simplified for now as this is a maintenance script
                count++;
            }
        }
        res.json({ success: true, count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get all tenants for an owner
const getOwnerTenants = async (req, res) => {
    try {
        const ownerId = req.user?.id;
        const { status } = req.query;
        // Ensure ownerId is String
        const query = { ownerId: String(ownerId), isDeleted: { $ne: true } };
        if (status) query.status = status;

        const tenants = await Tenant.find(query)
            .populate('userId', 'name email phone profilePicture')
            .sort({ createdAt: -1 });

        // Map to ensure profile info is available at top level for frontend
        const enrichedTenants = tenants.map(t => {
            const tObj = t.toObject();
            if (t.userId) {
                tObj.profilePicture = t.userId.profilePicture;
                tObj.userName = t.userId.name || tObj.userName;
                tObj.userEmail = t.userId.email || tObj.userEmail;
                tObj.userPhone = t.userId.phone || tObj.userPhone;
            }
            return tObj;
        });

        res.json({ success: true, tenants: enrichedTenants });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get tenants for a property
const getPropertyTenants = async (req, res) => {
    try {
        const { propertyId } = req.params;
        const ownerId = req.user?.id;

        const tenants = await Tenant.find({ propertyId, ownerId, isDeleted: { $ne: true } }).sort({ createdAt: -1 });
        res.json({ success: true, tenants });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get tenant details
const getTenantDetails = async (req, res) => {
    try {
        const { tenantId } = req.params;
        const userId = req.user?.id;

        const tenant = await Tenant.findById(tenantId)
            .populate('userId', 'profilePicture name email phone')
            .populate('propertyId')
            .populate('roomId');
        if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

        // Auth check - handle both string and populated object cases
        const tUserId = tenant.userId._id ? tenant.userId._id.toString() : tenant.userId.toString();
        const tOwnerId = tenant.ownerId.toString();

        if (tUserId !== userId && tOwnerId !== userId) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        // Fetch KYC Details (Aadhar)
        let kycData = null;
        try {
            const AadharDetails = mongoose.model('AadharDetails');
            const aadharDetails = await AadharDetails.findOne({ userId: tUserId });
            if (aadharDetails) {
                kycData = {
                    status: aadharDetails.approvalStatus,
                    aadhar: aadharDetails
                };
            }
        } catch (kycError) {
            console.error('Error fetching KYC details:', kycError);
        }

        const tenantObj = tenant.toObject();
        tenantObj.kyc = kycData;

        // Ensure profile picture is from the latest user data if populated
        if (tenant.userId && tenant.userId.profilePicture) {
            tenantObj.profilePicture = tenant.userId.profilePicture;
            tenantObj.userName = tenant.userId.name || tenantObj.userName; // Also update name if needed
        }

        res.json({ success: true, tenant: tenantObj });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get user's own tenant records
const getUserTenantRecords = async (req, res) => {
    try {
        const userId = req.user?.id;
        const tenants = await Tenant.find({ userId, isDeleted: { $ne: true } });
        res.json({ success: true, tenants });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get current tenancy status for dashboard redirection
const getTenantStatus = async (req, res) => {
    try {
        const userId = req.user?.id;

        // Find if user has an active tenancy
        const activeTenant = await Tenant.findOne({
            userId,
            status: 'active',
            isDeleted: { $ne: true }
        })
            .populate('propertyId')
            .populate('roomId')
            .populate('ownerId', 'name email phone')
            .sort({ createdAt: -1 });

        // Map to property and room keys for frontend compatibility
        let tenantData = null;
        if (activeTenant) {
            tenantData = activeTenant.toObject();
            tenantData.property = tenantData.propertyId;
            tenantData.room = tenantData.roomId;
            tenantData.owner = tenantData.ownerId;
        }

        res.json({
            success: true,
            isTenant: !!activeTenant,
            tenantData: tenantData
        });
    } catch (error) {
        console.error('Error in getTenantStatus:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getExpenses = async (req, res) => {
    try {
        const userId = req.user.id;

        // Find user's active property
        const activeTenant = await Tenant.findOne({
            userId,
            status: 'active',
            isDeleted: { $ne: true }
        });

        if (!activeTenant) {
            return res.status(404).json({ success: false, message: 'No active tenancy found.' });
        }

        const expenses = await Expense.find({ propertyId: activeTenant.propertyId })
            .populate('paidBy', 'name email')
            .populate('splits.user', 'name email')
            .sort({ date: -1 });

        res.json({ success: true, expenses });
    } catch (error) {
        console.error('Error in getExpenses:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const addExpense = async (req, res) => {
    try {
        const userId = req.user.id;
        const { description, totalAmount, category, date, targetUpiId, splits } = req.body;

        console.log('addExpense payload:', JSON.stringify(req.body, null, 2));
        console.log('userId:', userId);

        const activeTenant = await Tenant.findOne({
            userId,
            status: 'active',
            isDeleted: { $ne: true }
        });

        if (!activeTenant) {
            return res.status(404).json({ success: false, message: 'No active tenancy found.' });
        }

        const newExpense = new Expense({
            description,
            totalAmount,
            paidBy: userId,
            propertyId: activeTenant.propertyId,
            category,
            date,
            targetUpiId,
            splits
        });

        await newExpense.save();
        res.status(201).json({ success: true, expense: newExpense });
    } catch (error) {
        console.error('Error in addExpense:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ success: false, message: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

const settleExpense = async (req, res) => {
    try {
        const userId = req.user.id;
        const { expenseId } = req.params;

        const expense = await Expense.findById(expenseId);
        if (!expense) {
            return res.status(404).json({ success: false, message: 'Expense not found.' });
        }

        const splitIndex = expense.splits.findIndex(s => s.user.toString() === userId.toString());
        if (splitIndex === -1) {
            return res.status(403).json({ success: false, message: 'You are not part of this expense split.' });
        }

        expense.splits[splitIndex].status = 'settled';
        expense.splits[splitIndex].settledAt = new Date();

        await expense.save();
        res.json({ success: true, expense });
    } catch (error) {
        console.error('Error in settleExpense:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Update tenant details
const updateTenantDetails = async (req, res) => {
    try {
        const { tenantId } = req.params;
        const ownerId = req.user?.id;
        const updates = req.body;

        const tenant = await Tenant.findById(tenantId);
        if (!tenant || tenant.ownerId.toString() !== ownerId) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        Object.assign(tenant, updates);
        await tenant.save();
        res.json({ success: true, tenant });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Check In/Out Actions
const markTenantCheckIn = async (req, res) => {
    try {
        const { tenantId } = req.params;
        const ownerId = req.user?.id;

        const tenant = await Tenant.findById(tenantId);
        if (!tenant || tenant.ownerId.toString() !== ownerId) return res.status(403).json({ message: 'Unauthorized' });

        tenant.actualCheckInDate = new Date();
        tenant.status = 'active';
        await tenant.save();

        res.json({ success: true, tenant });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const markTenantCheckOut = async (req, res) => {
    try {
        const { tenantId } = req.params;
        const ownerId = req.user?.id;

        const tenant = await Tenant.findById(tenantId);
        if (!tenant || tenant.ownerId.toString() !== ownerId) return res.status(403).json({ message: 'Unauthorized' });

        tenant.actualCheckOutDate = new Date();
        tenant.status = 'completed';
        await tenant.save();

        await tenant.save();

        // Also update room status to available if needed
        await updateRoomOccupancyStatus(tenant.roomId);

        res.json({ success: true, tenant });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const markUserCheckIn = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { checkInDate } = req.body;
        const userId = req.user?.id;

        const booking = await Booking.findById(bookingId);
        if (!booking || booking.userId.toString() !== userId) return res.status(403).json({ message: 'Unauthorized' });

        booking.checkInDate = new Date(checkInDate);
        await booking.save();

        // Update tenant if exists
        const tenant = await Tenant.findOne({ bookingId });
        if (tenant) {
            tenant.checkInDate = new Date(checkInDate);
            await tenant.save();
        }

        res.json({ success: true, message: 'Updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get tenants for a room (public visibility of who lives there? or restricted?)
// Original code had this, maybe for "roommates" feature?
// Get tenants for a room (public visibility of who lives there? or restricted?)
// Original code had this, maybe for "roommates" feature?
const getRoomTenants = async (req, res) => {
    try {
        const { roomId } = req.params;
        // Logic to show public profile of current tenants?
        // Returning minimal info
        const tenants = await Tenant.find({
            roomId,
            status: 'active',
            isDeleted: { $ne: true }
        })
            .populate('userId', 'profilePicture')
            .select('userId userName userEmail userPhone actualCheckInDate status profilePicture');

        // Deduplicate by userId to handle potential data inconsistencies
        const uniqueTenants = [];
        const userIds = new Set();

        tenants.forEach(tenant => {
            const uid = tenant.userId?._id?.toString() || tenant.userId?.toString();
            if (uid && !userIds.has(uid)) {
                userIds.add(uid);
                uniqueTenants.push(tenant);
            }
        });

        res.json({ success: true, tenants: uniqueTenants });
    } catch (error) {
        console.error('Get room tenants error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Utilities for room occupancy
const updateRoomOccupancyStatus = async (roomId) => {
    try {
        const room = await Room.findById(roomId);
        if (!room) return;

        // Count confirmed active bookings/tenants
        // Statuses that count as "occupying" the room
        const activeStatuses = ['confirmed', 'checked_in', 'approved', 'payment_completed'];

        const activeCount = await Booking.countDocuments({
            roomId: roomId,
            status: { $in: activeStatuses },
            isDeleted: { $ne: true }
        });

        const isFull = activeCount >= room.occupancy;

        // Update room status
        room.is_available = !isFull;
        room.room_status = isFull ? 'full' : 'available';

        await room.save();
        console.log(`Updated Room ${room.room_number} status: Available=${room.is_available}, Count=${activeCount}/${room.occupancy}`);
    } catch (error) {
        console.error('Error updating room occupancy:', error);
    }
};

const updatePropertyRoomsOccupancy = async (propertyId) => {
    // Implementation logic...
};


// Add a new room to a property
const addRoom = async (req, res) => {
    try {
        const { propertyId } = req.params;
        const { roomData } = req.body;

        if (!roomData) {
            return res.status(400).json({ success: false, message: 'Room data is required' });
        }

        console.log('=== ADD ROOM REQUEST ===');
        console.log('Property ID:', propertyId);
        console.log('Room Data:', roomData);
        console.log('Files:', req.files ? req.files.map(f => f.fieldname) : 'None');

        const parsedRoomData = JSON.parse(roomData);
        const { room_number, room_type, rent, description, amenities, occupancy, room_size, bed_type } = parsedRoomData;

        // Verify property ownership
        const property = await Property.findById(propertyId);
        if (!property) {
            return res.status(404).json({ success: false, message: 'Property not found' });
        }

        if (property.owner_id.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Handle Images
        let roomImageUrl = null;
        let toiletImageUrl = null;

        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                if (file.fieldname === 'room_image') {
                    const result = await uploadImage(file);
                    if (result.success) roomImageUrl = result.url;
                }
                if (file.fieldname === 'toilet_image') {
                    const result = await uploadImage(file);
                    if (result.success) toiletImageUrl = result.url;
                }
            }
        }

        const newRoom = new Room({
            property_id: propertyId,
            room_number,
            room_type,
            room_size,
            bed_type,
            rent,
            description,
            amenities,
            occupancy: occupancy || 1,
            room_image: roomImageUrl,
            toilet_image: toiletImageUrl,
            status: 'active',
            is_available: true
        });

        await newRoom.save();



        res.status(201).json({
            success: true,
            message: 'Room added successfully',
            data: newRoom
        });

    } catch (error) {
        console.error('Error adding room:', error);
        res.status(500).json({ success: false, message: 'Failed to add room', error: error.message });
    }
};

// Update Property Status
const updatePropertyStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user?.id;

        const property = await Property.findOne({ _id: id, owner_id: userId });
        if (!property) return res.status(404).json({ message: 'Property not found' });

        property.status = status;
        await property.save();

        res.json({ success: true, data: property });
    } catch (error) {
        console.error('Update property status error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Update property details
const updateProperty = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        // Find the property and verify ownership
        const property = await Property.findOne({ _id: id, owner_id: userId });
        if (!property) {
            return res.status(404).json({
                success: false,
                message: 'Property not found or you do not have permission to update it'
            });
        }

        // Parse propertyData from JSON string
        let updateData = {};
        if (req.body.propertyData) {
            try {
                updateData = JSON.parse(req.body.propertyData);
            } catch (parseError) {
                return res.status(400).json({ success: false, message: 'Invalid property data format' });
            }
        }

        // Upload images if provided
        let imageUrls = {};

        if (req.files && (Array.isArray(req.files) || Object.keys(req.files).length > 0)) {
            const allFiles = [];
            // Normalize req.files to array
            if (Array.isArray(req.files)) {
                req.files.forEach(file => allFiles.push(file));
            } else {
                Object.values(req.files).forEach(f => {
                    if (Array.isArray(f)) allFiles.push(...f);
                    else allFiles.push(f);
                });
            }

            for (const file of allFiles) {
                const result = await uploadImage(file);
                if (result.success) {
                    if (file.fieldname === 'galleryImages') {
                        if (!imageUrls.gallery) imageUrls.gallery = [];
                        imageUrls.gallery.push(result.url);
                    } else if (file.fieldname === 'outsideToiletImage') {
                        imageUrls.outsideToiletImage = result.url;
                    } else if (file.fieldname === 'landTaxReceipt') {
                        imageUrls.landTaxReceipt = result.url;
                    } else if (file.fieldname === 'documents') {
                        if (!imageUrls.documents) imageUrls.documents = [];
                        imageUrls.documents.push(result.url);
                    } else {
                        // Handle frontImage -> front
                        if (['frontImage', 'backImage', 'hallImage', 'kitchenImage'].includes(file.fieldname)) {
                            const imgType = file.fieldname.replace('Image', '');
                            imageUrls[imgType] = result.url;
                        }
                    }
                }
            }
        }

        // Merge image URLs with update data
        if (Object.keys(imageUrls).length > 0) {
            if (!updateData.images) updateData.images = property.images || {};

            if (imageUrls.front) updateData.images.front = imageUrls.front;
            if (imageUrls.back) updateData.images.back = imageUrls.back;
            if (imageUrls.hall) updateData.images.hall = imageUrls.hall;
            if (imageUrls.kitchen) updateData.images.kitchen = imageUrls.kitchen;

            if (imageUrls.gallery && imageUrls.gallery.length > 0) {
                updateData.images.gallery = [...(updateData.images.gallery || []), ...imageUrls.gallery];
            }

            if (imageUrls.outsideToiletImage) updateData.outside_toilet_image = imageUrls.outsideToiletImage;
            if (imageUrls.landTaxReceipt) updateData.land_tax_receipt = imageUrls.landTaxReceipt;
        }

        // Update the property
        const updatedProperty = await Property.findByIdAndUpdate(
            id,
            { ...updateData, updated_at: new Date() },
            { new: true }
        );

        res.status(200).json({
            success: true,
            message: 'Property updated successfully',
            data: updatedProperty
        });

    } catch (error) {
        console.error('Error updating property:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};


// Get all bookings for admin/debug (added manually)
const getAllBookingsAdmin = async (req, res) => {
    try {
        const bookings = await Booking.find({ isDeleted: false })
            .sort({ bookedAt: -1 })
            .limit(100);

        res.json({
            success: true,
            bookings: bookings
        });
    } catch (error) {
        console.error('Get all bookings error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};


module.exports = {
    getAllBookingsAdmin,
    updateProperty,
    updatePropertyStatus,
    addProperty,
    getProperties,
    getAllPropertiesAdmin,
    approvePropertyAdmin,
    approveRoomAdmin,
    sendAdminMessage,
    getProperty,
    getPropertyAdmin,
    getApprovedPropertiesPublic,
    getApprovedPropertyPublic,
    updateRoomStatus,
    updateRoom,
    addRoom,
    getRoomPublic,
    getAllRoomsDebug,
    createPaymentOrder,
    verifyPaymentAndCreateBooking,
    createBookingPublic,
    listOwnerBookings,
    getPendingApprovalBookings,
    checkUserBookingStatus,
    getUserBookings,
    getBookingDetails,
    getBookingDetailsPublic,
    updateBookingStatus,
    cancelAndDeleteBooking,
    finalizeCheckIn,
    lookupBookingDetails,
    addFavorite,
    removeFavorite,
    getUserFavorites,
    checkFavoriteStatus,
    createMissingTenantRecords,
    getOwnerTenants,
    getPropertyTenants,
    getTenantDetails,
    getUserTenantRecords,
    updateTenantDetails,
    markTenantCheckIn,
    markTenantCheckOut,
    markUserCheckIn,
    deleteRoomAdmin,
    deletePropertyAdmin,
    getRoomTenants,
    getTenantStatus,
    getExpenses,
    addExpense,
    settleExpense
};
