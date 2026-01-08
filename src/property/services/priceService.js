const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

/**
 * Predict rent based on room and property details
 * @param {Object} data - { location, roomType, roomSize, amenities: { ac, attachedBath, ... } }
 * @returns {Promise<Object>} - Predicted rent and range
 */
const predictRent = async (data) => {
    try {
        console.log('Predicting rent for:', data);

        // Map frontend data to ML model expected format
        // Calculate furnishing status
        const furnitureItems = ['tv', 'fridge', 'wardrobe', 'studyTable'];
        let furnitureCount = 0;
        furnitureItems.forEach(item => {
            if (data.amenities?.[item]) furnitureCount++;
        });

        let furnishedStatus = 'Unfurnished';
        if (furnitureCount >= 3) furnishedStatus = 'Fully'; // e.g. TV + Fridge + Wardrobe
        else if (furnitureCount >= 1) furnishedStatus = 'Semi';

        const payload = {
            location: data.location || 'Other',
            room_type: data.roomType || 'Single',
            room_size: parseFloat(data.roomSize) || 100,
            ac: data.amenities?.ac ? 1 : 0,
            attached_bath: data.amenities?.attachedBathroom ? 1 : 0,
            parking: (data.propertyAmenities?.parking4w || data.propertyAmenities?.parking2w) ? 1 : 0,
            kitchen: data.propertyAmenities?.kitchen ? 1 : 0,
            power_backup: data.propertyAmenities?.powerBackup ? 1 : 0,

            // New Amenities
            wifi: data.amenities?.wifi ? 1 : 0,
            tv: data.amenities?.tv ? 1 : 0,
            fridge: data.amenities?.fridge ? 1 : 0,
            wardrobe: data.amenities?.wardrobe ? 1 : 0,
            study_table: data.amenities?.studyTable ? 1 : 0,
            balcony: data.amenities?.balcony ? 1 : 0,

            furnished: furnishedStatus
        };

        const response = await axios.post(`${ML_SERVICE_URL}/predict_rent`, payload, {
            timeout: 30000 // 30 second timeout for cold starts
        });

        if (response.data && response.data.success) {
            return response.data;
        } else {
            throw new Error(response.data?.error || 'ML Service returned failure');
        }
    } catch (error) {
        console.error('Rent Prediction Error:', error.message);
        // Fallback or rethrow
        throw error;
    }
};

module.exports = {
    predictRent
};
