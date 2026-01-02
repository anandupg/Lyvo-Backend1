const mongoose = require('mongoose');
require('dotenv').config();

const runFinalFix = async () => {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lyvo';
        await mongoose.connect(mongoUri);
        console.log('Connected to DB');

        const Tenant = require('./src/property/models/Tenant');
        const Room = require('./src/property/models/Room');
        const Booking = require('./src/property/models/Booking');

        // 1. Fix Room 1 Capacity
        const targetRoom = await Room.findOne({ room_number: 1 });
        if (!targetRoom) {
            console.log('Room 1 NOT found (by room_number: 1).');
            return;
        }
        console.log(`Target Room 1 Found (ID: ${targetRoom._id}). Current Cap: ${targetRoom.occupancy}`);

        targetRoom.occupancy = 4;
        await targetRoom.save();
        console.log('Room 1 Capacity set to 4.');

        // 2. Find Tenants
        const allTenants = await Tenant.find({});
        console.log(`Total Tenants in DB: ${allTenants.length}`);

        const matchingTenants = allTenants.filter(t => {
            const rNum = String(t.roomNumber || '').trim();
            const rId = String(t.roomId || '');
            const targetId = String(targetRoom._id);

            // Match by Number OR ID
            const match = rNum === '1' || rId === targetId;
            // console.log(`Tenant ${t.userName}: Num='${rNum}', ID='${rId}' -> Match=${match}`);
            return match;
        });

        console.log(`Found ${matchingTenants.length} tenants for Room 1.`);

        // 3. Recreate Bookings
        for (const t of matchingTenants) {
            // Relink ID just in case
            if (String(t.roomId) !== String(targetRoom._id)) {
                t.roomId = targetRoom._id;
                await t.save();
                console.log(`Relinked Tenant ${t.userName} to Room 1 ID.`);
            }

            // Check Booking
            const booking = await Booking.findOne({ _id: t.bookingId });
            if (!booking) {
                console.log(`Creating missing booking for ${t.userName}...`);
                await Booking.create({
                    _id: t.bookingId,
                    userId: t.userId,
                    ownerId: t.ownerId,
                    propertyId: t.propertyId,
                    roomId: targetRoom._id,
                    status: 'checked_in',
                    payment: {
                        totalAmount: t.amountPaid || 0,
                        monthlyRent: t.monthlyRent || 0,
                        securityDeposit: t.securityDeposit || 0
                    },
                    userSnapshot: { name: t.userName, email: t.userEmail, phone: t.userPhone },
                    ownerSnapshot: { name: t.ownerName, email: t.ownerEmail },
                    propertySnapshot: { name: t.propertyName },
                    roomSnapshot: { roomNumber: 1, roomType: targetRoom.room_type || 'Shared' }
                });
                console.log(`Booking created.`);
            } else {
                if (booking.status !== 'checked_in') {
                    booking.status = 'checked_in';
                    await booking.save();
                    console.log(`Fixed booking status for ${t.userName}.`);
                }
            }
        }

        // 4. Final Count
        const count = await Booking.countDocuments({
            roomId: targetRoom._id,
            status: { $in: ['confirmed', 'checked_in', 'approved', 'payment_completed'] },
            isDeleted: { $ne: true }
        });
        console.log(`Final Active Booking Count for Room 1: ${count}`);

        // 5. Update Status
        targetRoom.is_available = count < targetRoom.occupancy;
        targetRoom.room_status = targetRoom.is_available ? 'available' : 'full';
        await targetRoom.save();
        console.log(`Final Room Status: Available=${targetRoom.is_available}, Count=${count}/${targetRoom.occupancy}`);

    } catch (error) {
        console.error('Final Fix Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

runFinalFix();
