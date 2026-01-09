const mongoose = require('mongoose');
let addProperty;
try {
    const controller = require('../src/property/controller');
    addProperty = controller.addProperty;
} catch (e) {
    console.error("Failed to require controller:", e);
    process.exit(1);
}
const Property = require('../src/property/models/Property');
const Room = require('../src/property/models/Room');
const User = require('../src/user/model'); // Corrected path
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://admin:admin123@lyvo.s5spa.mongodb.net/lyvo_db?retryWrites=true&w=majority&appName=Lyvo";

// Mock objects
const mockReq = (body, user) => ({
    body,
    user: user || { id: new mongoose.Types.ObjectId(), _id: new mongoose.Types.ObjectId(), role: 3 },
    files: { // addProperty handles file uploads usually, might crash if missing
        frontImage: [{ path: 'mock/path' }],
        // Add others if strictly required
    }
});

const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.data = data;
        return res;
    };
    return res;
};

// We might need to mock file upload middleware or validation if addProperty uses them directly from req
// controller.js addProperty takes (req, res).
// It usually extracts files from req.files.

async function run() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB");

        // Clean up
        await Property.deleteMany({ property_name: "RentVerificationProp" });

        // Test Data
        // Wraps fields into propertyData as expected by controller
        const propertyPayload = {
            propertyName: "RentVerificationProp",
            propertyType: "Apartment Complex",
            address: { street: "123", city: "Test", state: "TS", pincode: "123456" },
            rooms: [
                { roomNumber: "101", roomType: "Double", occupancy: 2, rent: 10000, amenities: {}, bedType: "Single Bed" },
                { roomNumber: "102", roomType: "Triple", occupancy: 3, rent: 10000, amenities: {}, bedType: "Bunk Bed" }
            ],
            amenities: { wifi: true },
            rules: {},
            securityDeposit: 5000,
            noticePeriod: 30,
            description: "Test"
        };

        const req = mockReq({
            propertyData: JSON.stringify(propertyPayload)
        });

        // Fix for req.files if controller checks specific fields
        req.files = {};

        const res = mockRes();

        console.log("Calling addProperty...");
        // Check if addProperty is async
        await addProperty(req, res);

        console.log("Status:", res.statusCode);

        if (res.statusCode !== 201 && res.statusCode !== 200) {
            console.log("Response:", res.data);
            console.error("Failed to add property");
            return;
        }

        if (res.data && res.data.success) {
            const propId = res.data.data.property._id;
            const rooms = await Room.find({ property_id: propId });
            console.log(`Created ${rooms.length} rooms.`);

            const r1 = rooms.find(r => r.room_number === 101);
            const r2 = rooms.find(r => r.room_number === 102);

            console.log(`Room 101 (Occ 2, Rent 10000) PerPersonRent: ${r1.perPersonRent}`);
            console.log(`Room 102 (Occ 3, Rent 10000) PerPersonRent: ${r2.perPersonRent}`);

            let pass = true;
            if (r1.perPersonRent !== 5000) {
                console.error("FAIL: Room 101 should be 5000");
                pass = false;
            } else {
                console.log("PASS: Room 101 calc correct");
            }

            if (r2.perPersonRent !== 3334) {
                console.error("FAIL: Room 102 should be 3334");
                pass = false;
            } else {
                console.log("PASS: Room 102 calc correct");
            }

            if (pass) console.log("ALL CHECKS PASSED");

        } else {
            console.error("addProperty returned success:false", res.data);
        }

    } catch (e) {
        console.error("Script Error:", e);
    } finally {
        // Cleanup again
        // await Property.deleteMany({ property_name: "RentVerificationProp" });
        await mongoose.disconnect();
    }
}

run();
