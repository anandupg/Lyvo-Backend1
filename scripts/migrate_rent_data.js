const mongoose = require('mongoose');
const Room = require('../src/property/models/Room');
const Tenant = require('../src/property/models/Tenant');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://admin:admin123@lyvo.s5spa.mongodb.net/lyvo_db?retryWrites=true&w=majority&appName=Lyvo";

async function runMigration() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB for Migration");

        // 1. Update Rooms: Calculate and set perPersonRent
        console.log("--- Updating Rooms ---");
        const rooms = await Room.find({});
        let roomsUpdated = 0;
        for (const room of rooms) {
            if (!room.perPersonRent || room.perPersonRent === 0) {
                const occupancy = room.occupancy || 1;
                const totalRent = room.rent || 0;
                const pRent = Math.ceil(totalRent / occupancy);

                room.perPersonRent = pRent;
                await room.save();
                // console.log(`Updated Room ${room.room_number}: Total=${totalRent}, Occ=${occupancy} -> PerPerson=${pRent}`);
                roomsUpdated++;
            }
        }
        console.log(`Updated ${roomsUpdated} rooms with missing perPersonRent.`);


        // 2. Update Active Tenants: Sync monthlyRent with Room.perPersonRent
        console.log("--- Updating Tenants ---");
        const tenants = await Tenant.find({ status: { $in: ['active', 'extended'] }, isDeleted: { $ne: true } }).populate('roomId');
        let tenantsUpdated = 0;
        for (const tenant of tenants) {
            if (tenant.roomId) {
                const room = tenant.roomId;
                const roomPerPersonRent = room.perPersonRent; // Should be set now

                // If tenant rent differs significantly (e.g. they verified with total rent), fix it
                // Logic: If tenant.monthlyRent is roughly equal to room.rent (Total), switch to PerPerson
                // Or just force enforce perPersonRent for consistency?
                // Safety: Update if tenant.monthlyRent != room.perPersonRent

                if (tenant.monthlyRent !== roomPerPersonRent && roomPerPersonRent > 0) {
                    console.log(`Tenant ${tenant.userName} (Room ${room.room_number}): Current=${tenant.monthlyRent}, Target=${roomPerPersonRent}`);
                    tenant.monthlyRent = roomPerPersonRent;
                    await tenant.save();
                    tenantsUpdated++;
                }
            }
        }
        console.log(`Updated ${tenantsUpdated} active tenants to match per-person rent.`);

        console.log("Migration Complete.");

    } catch (error) {
        console.error("Migration Failed:", error);
    } finally {
        await mongoose.disconnect();
    }
}

runMigration();
