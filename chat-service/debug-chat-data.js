const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not defined');
  process.exit(1);
}
mongoose.connect(process.env.MONGODB_URI);

const Chat = require('./src/models/Chat');
const Message = require('./src/models/Message');

async function debugChatData() {
  try {
    console.log('🔍 Debugging chat data...\n');

    // Get all chats
    const chats = await Chat.find({}).limit(5);
    console.log(`Found ${chats.length} chats:`);

    for (const chat of chats) {
      console.log(`\n📋 Chat ID: ${chat._id}`);
      console.log(`   Booking ID: ${chat.bookingId}`);
      console.log(`   Owner ID: ${chat.ownerId}`);
      console.log(`   Seeker ID: ${chat.seekerId}`);
      console.log(`   Status: ${chat.status}`);

      // Test property service API
      try {
        const response = await fetch(`http://localhost:3002/api/public/bookings/${chat.bookingId}`);
        if (response.ok) {
          const bookingData = await response.json();
          console.log(`   ✅ Booking data: ${bookingData.booking?.userName || 'No name'} - ${bookingData.booking?.propertyName || 'No property'}`);
        } else {
          console.log(`   ❌ Booking API error: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.log(`   ❌ Booking API error: ${error.message}`);
      }

      // Test user service API
      try {
        const userResponse = await fetch(`http://localhost:4002/api/public/user/${chat.ownerId}`);
        if (userResponse.ok) {
          const userData = await userResponse.json();
          console.log(`   ✅ Owner data: ${userData.name || 'No name'}`);
        } else {
          console.log(`   ❌ Owner API error: ${userResponse.status} ${userResponse.statusText}`);
        }
      } catch (error) {
        console.log(`   ❌ Owner API error: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

debugChatData();
