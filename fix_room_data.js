const mongoose = require('mongoose');
require('dotenv').config();

const fixData = async () => {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lyvo';
        await mongoose.connect(mongoUri);
        console.log('Connected to DB');

        const Room = require('./src/property/models/Room');
        const Tenant = require('./src/property/models/Tenant');
        const Booking = require('./src/property/models/Booking');

        // 1. Target Room 1 explicitly for Booking Restoration
        const targetRoom = await Room.findOne({ room_number: 1 });

        if (targetRoom) {
            console.log(`Targeting Room 1 (ID: ${targetRoom._id}). Occupancy: ${targetRoom.occupancy}`);
            // Ensure capacity is 4 (redundant but safe)
            if (targetRoom.occupancy !== 4) {
                targetRoom.occupancy = 4;
                await targetRoom.save();
                console.log('Set capacity to 4.');
            }
        } else {
            console.log('Room 1 not found!');
            return;
        }

        // 2. Search for Tenants (Scan All with Debug)
        const allTenantsList = await Tenant.find({});
        console.log(`Scanning ${allTenantsList.length} total tenants for Room 1...`);

        const allTenants = allTenantsList.filter(t => {
            const val = String(t.roomNumber).trim();
            const match = val === '1';
            console.log(`Checking Tenant ${t.userName}: roomNumber=${t.roomNumber} (Type: ${typeof t.roomNumber}) -> Normalized='${val}' -> Match=${match}`);
            if (match) return true;
            return false;
        });
        console.log(`Found ${allTenants.length} matching tenants for Room 1.`);

        for (const t of allTenants) {
            console.log(`Tenant: ${t.userName}, Current RoomID: ${t.roomId}, Target: ${targetRoom._id}`);

            // Relink to valid room if needed
            if (t.roomId.toString() !== targetRoom._id.toString()) {
                console.log(`> Relinking Tenant ${t.userName} to valid Room ID...`);
                t.roomId = targetRoom._id;
                t.propertyName = 'Lyvo'; // Ensure correct property name if needed
                t.propertyId = targetRoom.property_id;
                await t.save();
            }
            console.log(`Tenant: ${t.userName} (${t.userEmail}), Status: ${t.status}, Deleted: ${t.isDeleted}`);
            if (t.isDeleted || t.status !== 'active') {
                console.log(`> Restoring Tenant ${t.userName}...`);
                t.isDeleted = false;
                t.status = 'active';
                await t.save();

                // Check if booking exists
                const booking = await Booking.findOne({ _id: t.bookingId });
                if (!booking) {
                    console.log(`> Booking missing for Tenant ${t.userName}. Recreating...`);
                    const newBooking = new Booking({
                        _id: t.bookingId, // Try to reuse ID if possible, or new one
                        userId: t.userId,
                        ownerId: t.ownerId,
                        propertyId: t.propertyId,
                        roomId: t.roomId,
                        status: 'checked_in',
                        payment: {
                            totalAmount: t.amountPaid || 0,
                            securityDeposit: t.securityDeposit || 0,
                            monthlyRent: t.monthlyRent || 0,
                            paymentStatus: 'completed'
                        },
                        // snapshots are harder to recreate fully but minimal info is needed
                        userSnapshot: { name: t.userName, email: t.userEmail, phone: t.userPhone, profilePicture: t.profilePicture },
                        ownerSnapshot: { name: t.ownerName, email: t.ownerEmail, phone: t.ownerPhone },
                        propertySnapshot: { name: t.propertyName },
                        roomSnapshot: { roomNumber: t.roomNumber }
                    });
                    await newBooking.save();
                    console.log(`> Booking recreated.`);
                } else {
                    console.log(`> Booking exists. Ensuring it's active.`);
                    booking.status = 'checked_in';
                    booking.isDeleted = false;
                    await booking.save();
                }
            }
        }

        // 3. Final Verification
        const finalCount = await Booking.countDocuments({
            roomId: targetRoom._id,
            status: { $in: ['confirmed', 'checked_in', 'approved', 'payment_completed'] },
            isDeleted: { $ne: true }
        });
        console.log(`Final Active Booking Count: ${finalCount}`);

        // Update Room Occupancy Status in DB
        const activeStatuses = ['confirmed', 'checked_in', 'approved', 'payment_completed'];
        const isFull = finalCount >= targetRoom.occupancy;
        targetRoom.is_available = !isFull;
        targetRoom.room_status = isFull ? 'full' : 'available';
        await targetRoom.save();
        console.log(`Final Room Status: Available=${targetRoom.is_available}, Full=${isFull}`);

    } catch (error) {
        console.error('Fix Failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

fixData();
