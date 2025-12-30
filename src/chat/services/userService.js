/**
 * User Service - Fetches user details from main backend
 * This service integrates with the main Lyvo backend to get owner and tenant details
 */

class UserService {
  constructor() {
    this.mainApiUrl = process.env.MAIN_API_URL || 'http://localhost:4002/api';
  }

  /**
   * Get user details by ID from main backend (including profile picture)
   */
  async getUserDetails(userId) {
    try {
      const response = await fetch(`${this.mainApiUrl}/public/user/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.user || data;
      } else {
        console.error(`Failed to fetch user details for ${userId}:`, response.status);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching user details for ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get tenant details from property service by booking ID (using public endpoint)
   */
  async getTenantDetailsByBooking(bookingId) {
    try {
      const propertyServiceUrl = process.env.PROPERTY_SERVICE_URL || 'http://localhost:3002';
      const response = await fetch(`${propertyServiceUrl}/api/public/bookings/${bookingId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const booking = data.booking || data;
        
        // Extract tenant details from booking
        return {
          id: booking.userId,
          name: booking.userName,
          email: booking.userEmail,
          phone: booking.userPhone,
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${booking.userName}`,
          role: 'seeker'
        };
      } else {
        console.error(`Failed to fetch tenant details for booking ${bookingId}:`, response.status);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching tenant details for booking ${bookingId}:`, error);
      return null;
    }
  }

  /**
   * Get owner details from property service by booking ID (using public endpoint)
   */
  async getOwnerDetailsByBooking(bookingId) {
    try {
      const propertyServiceUrl = process.env.PROPERTY_SERVICE_URL || 'http://localhost:3002';
      const response = await fetch(`${propertyServiceUrl}/api/public/bookings/${bookingId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const booking = data.booking || data;
        
        // Extract owner details from booking
        return {
          id: booking.ownerId,
          name: booking.ownerName,
          email: booking.ownerEmail,
          phone: booking.ownerPhone,
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${booking.ownerName}`,
          role: 'owner'
        };
      } else {
        console.error(`Failed to fetch owner details for booking ${bookingId}:`, response.status);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching owner details for booking ${bookingId}:`, error);
      return null;
    }
  }

  /**
   * Get property details by ID from property service
   */
  async getPropertyDetails(propertyId) {
    try {
      const propertyServiceUrl = process.env.PROPERTY_SERVICE_URL || 'http://localhost:3002';
      const response = await fetch(`${propertyServiceUrl}/api/public/properties/${propertyId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.property || data;
      } else {
        console.error(`Failed to fetch property details for ${propertyId}:`, response.status);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching property details for ${propertyId}:`, error);
      return null;
    }
  }

  /**
   * Get booking details by ID from property service (using public endpoint)
   */
  async getBookingDetails(bookingId) {
    try {
      const propertyServiceUrl = process.env.PROPERTY_SERVICE_URL || 'http://localhost:3002';
      const response = await fetch(`${propertyServiceUrl}/api/public/bookings/${bookingId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.booking || data;
      } else {
        console.error(`Failed to fetch booking details for ${bookingId}:`, response.status);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching booking details for ${bookingId}:`, error);
      return null;
    }
  }

  /**
   * Get enriched chat data with user and property details from real booking data
   */
  async getEnrichedChatData(chat) {
    try {
      // Get booking details first (contains all user and property info)
      const bookingDetails = await this.getBookingDetails(chat.bookingId);
      
      if (!bookingDetails) {
        console.error('No booking details found for chat:', chat.bookingId);
        return chat;
      }

      // Get actual user profile details for better avatars
      const [ownerProfile, seekerProfile] = await Promise.all([
        this.getUserDetails(bookingDetails.ownerId),
        this.getUserDetails(bookingDetails.userId)
      ]);

      // Extract owner details from booking with actual profile picture
      const ownerDetails = {
        id: bookingDetails.ownerId,
        name: bookingDetails.ownerName || ownerProfile?.name || 'Property Owner',
        email: bookingDetails.ownerEmail || ownerProfile?.email,
        phone: bookingDetails.ownerPhone || ownerProfile?.phone,
        avatar: ownerProfile?.profilePicture || 
                ownerProfile?.avatar || 
                `https://api.dicebear.com/7.x/initials/svg?seed=${bookingDetails.ownerName || 'Owner'}`,
        role: 'owner'
      };

      // Extract tenant details from booking with actual profile picture
      const seekerDetails = {
        id: bookingDetails.userId,
        name: bookingDetails.userName || seekerProfile?.name || 'Tenant',
        email: bookingDetails.userEmail || seekerProfile?.email,
        phone: bookingDetails.userPhone || seekerProfile?.phone,
        avatar: seekerProfile?.profilePicture || 
                seekerProfile?.avatar || 
                `https://api.dicebear.com/7.x/initials/svg?seed=${bookingDetails.userName || 'Tenant'}`,
        role: 'seeker'
      };

      // Extract property details from booking
      const propertyDetails = {
        id: bookingDetails.propertyId,
        name: bookingDetails.propertyName || 'Property',
        address: bookingDetails.propertyName || 'Property Address',
        type: 'Property',
        roomId: bookingDetails.roomId,
        roomNumber: bookingDetails.roomNumber || 'N/A'
      };

      return {
        ...chat,
        ownerDetails,
        seekerDetails,
        propertyDetails,
        bookingDetails: {
          id: bookingDetails._id || bookingDetails.id,
          checkInDate: bookingDetails.checkInDate,
          checkOutDate: bookingDetails.checkOutDate,
          status: bookingDetails.status,
          monthlyRent: bookingDetails.monthlyRent,
          securityDeposit: bookingDetails.securityDeposit,
          amountPaid: bookingDetails.amountPaid,
          specialRequests: bookingDetails.specialRequests,
          confirmedAt: bookingDetails.confirmedAt
        }
      };
    } catch (error) {
      console.error('Error enriching chat data:', error);
      return chat;
    }
  }

  /**
   * Get other participant details for a chat
   */
  async getOtherParticipantDetails(chat, currentUserId) {
    const enrichedChat = await this.getEnrichedChatData(chat);
    
    if (currentUserId === chat.ownerId) {
      return enrichedChat.seekerDetails;
    } else if (currentUserId === chat.seekerId) {
      return enrichedChat.ownerDetails;
    }
    
    return null;
  }
}

module.exports = new UserService();
