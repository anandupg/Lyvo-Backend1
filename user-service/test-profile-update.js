const mongoose = require('mongoose');
const User = require('./src/model');

async function testProfileUpdate() {
  try {
    await mongoose.connect('mongodb://localhost:27017/lyvo');
    console.log('Connected to MongoDB');
    
    // Find a seeker user
    const user = await User.findOne({ role: 1 });
    if (!user) {
      console.log('No seeker user found');
      return;
    }
    
    console.log('Found user:', {
      id: user._id,
      name: user.name,
      age: user.age,
      gender: user.gender,
      phone: user.phone,
      occupation: user.occupation
    });
    
    // Test updating age and gender
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { 
        $set: { 
          age: 25, 
          gender: 'male',
          phone: '9876543210',
          occupation: 'Software Engineer'
        } 
      },
      { new: true, runValidators: true }
    ).select('-password');
    
    console.log('Updated user:', {
      id: updatedUser._id,
      name: updatedUser.name,
      age: updatedUser.age,
      gender: updatedUser.gender,
      phone: updatedUser.phone,
      occupation: updatedUser.occupation
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testProfileUpdate();
