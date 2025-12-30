const Notification = require('../models/Notification');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');
const User = require('../../user/model');

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

class NotificationService {
  /**
   * Create a notification
   */
  static async createNotification({
    recipient_id,
    recipient_type,
    title,
    message,
    type,
    related_property_id = null,
    related_room_id = null,
    related_booking_id = null,
    action_url = null,
    created_by = null,
    metadata = {}
  }) {
    try {
      console.log('🔔 createNotification called with:');
      console.log('Recipient ID:', recipient_id);
      console.log('Recipient Type:', recipient_type);
      console.log('Title:', title);
      console.log('Message:', message);
      console.log('Type:', type);

      const notification = new Notification({
        recipient_id,
        recipient_type,
        title,
        message,
        type,
        related_property_id,
        related_room_id,
        related_booking_id,
        action_url,
        created_by,
        metadata
      });

      console.log('Notification object created:', notification);
      await notification.save();
      console.log(`✅ Notification created for user ${recipient_id}: ${title}`);
      console.log('Saved notification:', notification);

      // Emit socket event if io is available logically
      if (global.io) {
        // Emit to user_userId room
        global.io.to(`user_${recipient_id}`).emit('new_notification', notification);
      }

      return notification;
    } catch (error) {
      console.error('❌ Error creating notification:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Notify property approval
   */
  static async notifyPropertyApproval(property, adminId) {
    return await this.createNotification({
      recipient_id: property.owner_id,
      recipient_type: 'owner',
      title: 'Property Approved! 🎉',
      message: `Your property "${property.property_name}" has been approved by the admin and is now live!`,
      type: 'property_approved',
      related_property_id: property._id,
      action_url: `/owner-properties/${property._id}`,
      created_by: adminId,
      metadata: {
        property_name: property.property_name,
        property_id: property._id
      }
    });
  }

  /**
   * Notify property rejection
   */
  static async notifyPropertyRejection(property, adminId, reason = null) {
    return await this.createNotification({
      recipient_id: property.owner_id,
      recipient_type: 'owner',
      title: 'Property Rejected',
      message: `Your property "${property.property_name}" has been rejected by the admin.${reason ? ` Reason: ${reason}` : ''}`,
      type: 'property_rejected',
      related_property_id: property._id,
      action_url: `/owner-properties/${property._id}`,
      created_by: adminId,
      metadata: {
        property_name: property.property_name,
        property_id: property._id,
        reason
      }
    });
  }

  /**
   * Notify room approval
   */
  static async notifyRoomApproval(room, property, adminId) {
    return await this.createNotification({
      recipient_id: property.owner_id,
      recipient_type: 'owner',
      title: 'Room Approved! ✅',
      message: `Room ${room.room_number} in "${property.property_name}" has been approved and is now available for booking!`,
      type: 'room_approved',
      related_property_id: property._id,
      related_room_id: room._id,
      action_url: `/owner-properties/${property._id}`,
      created_by: adminId,
      metadata: {
        property_name: property.property_name,
        room_number: room.room_number,
        room_type: room.room_type,
        property_id: property._id,
        room_id: room._id
      }
    });
  }

  /**
   * Notify room rejection
   */
  static async notifyRoomRejection(room, property, adminId, reason = null) {
    return await this.createNotification({
      recipient_id: property.owner_id,
      recipient_type: 'owner',
      title: 'Room Rejected',
      message: `Room ${room.room_number} in "${property.property_name}" has been rejected by the admin.${reason ? ` Reason: ${reason}` : ''}`,
      type: 'room_rejected',
      related_property_id: property._id,
      related_room_id: room._id,
      action_url: `/owner-properties/${property._id}`,
      created_by: adminId,
      metadata: {
        property_name: property.property_name,
        room_number: room.room_number,
        room_type: room.room_type,
        property_id: property._id,
        room_id: room._id,
        reason
      }
    });
  }

  /**
   * Notify booking request (to owner)
   */
  static async notifyBookingRequest(booking, property, seekerId) {
    console.log('🔔 notifyBookingRequest called with:');
    console.log('Booking:', booking._id);
    console.log('Property:', property._id, property.property_name);
    console.log('Owner ID:', property.owner_id);
    console.log('Seeker ID:', seekerId);

    const notificationData = {
      recipient_id: property.owner_id,
      recipient_type: 'owner',
      title: 'New Booking Request',
      message: `You have a new booking request for "${property.property_name}"`,
      type: 'booking_request',
      related_property_id: property._id,
      related_booking_id: booking._id,
      action_url: `/owner-bookings/${booking._id}`,
      created_by: seekerId,
      metadata: {
        property_name: property.property_name,
        property_id: property._id,
        booking_id: booking._id
      }
    };

    console.log('Notification data:', notificationData);

    return await this.createNotification(notificationData);
  }

  /**
   * Send email notification
   */
  static async sendEmail(to, subject, htmlContent) {
    try {
      if (!process.env.SENDGRID_API_KEY) {
        console.log('⚠️ SendGrid not configured, skipping email to:', to);
        return;
      }

      const msg = {
        to,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@lyvo.com',
        subject,
        html: htmlContent
      };

      await sgMail.send(msg);
      console.log(`✅ Email sent to ${to}: ${subject}`);
    } catch (error) {
      console.error('❌ Error sending email:', error.response?.body || error.message);
    }
  }

  /**
   * Get user email by ID
   */
  static async getUserEmail(userId) {
    try {
      // Direct DB access instead of HTTP call
      const user = await User.findById(userId).select('email');
      return user?.email || null;
    } catch (error) {
      console.error('Error fetching user email:', error.message);
      return null;
    }
  }

  /**
   * Notify booking approval (to seeker)
   */
  static async notifyBookingApproval(booking, property, room, ownerId) {
    // Create in-app notification
    const notification = await this.createNotification({
      recipient_id: booking.userId,
      recipient_type: 'seeker',
      title: 'Booking Approved! 🎉',
      message: `Your booking for "${property.property_name}" - Room ${room?.room_number || 'N/A'} has been approved by the owner!`,
      type: 'booking_approved',
      related_property_id: property._id,
      related_room_id: room?._id,
      related_booking_id: booking._id,
      action_url: `/seeker-post-booking-dashboard`,
      created_by: ownerId,
      metadata: {
        property_name: property.property_name,
        room_number: room?.room_number,
        property_id: property._id,
        room_id: room?._id,
        booking_id: booking._id
      }
    });

    // Send email notification
    try {
      const userEmail = booking.userSnapshot?.email || await this.getUserEmail(booking.userId);
      if (userEmail) {
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
              .button { display: inline-block; background: #22c55e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
              .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
              .detail-row:last-child { border-bottom: none; }
              .label { color: #6b7280; }
              .value { font-weight: bold; color: #111827; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0; font-size: 28px;">🎉 Booking Approved!</h1>
              </div>
              <div class="content">
                <p style="font-size: 18px; color: #111827;">Dear ${booking.userSnapshot?.name || 'Valued Guest'},</p>
                <p>Great news! Your booking has been approved by the property owner.</p>
                
                <div class="details">
                  <h3 style="margin-top: 0; color: #111827;">Booking Details</h3>
                  <div class="detail-row">
                    <span class="label">Property:</span>
                    <span class="value">${property.property_name}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">Room Number:</span>
                    <span class="value">${room?.room_number || 'N/A'}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">Room Type:</span>
                    <span class="value">${room?.room_type || 'N/A'}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">Monthly Rent:</span>
                    <span class="value">₹${room?.rent?.toLocaleString() || 'N/A'}</span>
                  </div>
                </div>

                <p><strong>What's Next?</strong></p>
                <ul>
                  <li>The owner will contact you to finalize check-in details</li>
                  <li>Complete your remaining payment (90%) during check-in</li>
                  <li>Review the property rules and guidelines</li>
                </ul>

                <div style="text-align: center;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/booking-dashboard/${booking._id}" class="button">
                    View Booking Details
                  </a>
                </div>

                <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
                  If you have any questions, please contact the property owner or our support team.
                </p>
              </div>
            </div>
          </body>
          </html>
        `;

        await this.sendEmail(
          userEmail,
          `Booking Approved - ${property.property_name}`,
          emailHtml
        );
      }
    } catch (emailError) {
      console.error('Error sending approval email:', emailError);
    }

    return notification;
  }

  /**
   * Notify booking rejection (to seeker)
   */
  static async notifyBookingRejection(booking, property, room, ownerId, reason = null) {
    // Create in-app notification
    const notification = await this.createNotification({
      recipient_id: booking.userId,
      recipient_type: 'seeker',
      title: 'Booking Rejected',
      message: `Your booking for "${property.property_name}" - Room ${room?.room_number || 'N/A'} has been rejected by the owner.${reason ? ` Reason: ${reason}` : ''}`,
      type: 'booking_rejected',
      related_property_id: property._id,
      related_room_id: room?._id,
      related_booking_id: booking._id,
      action_url: `/seeker-search-properties`,
      created_by: ownerId,
      metadata: {
        property_name: property.property_name,
        room_number: room?.room_number,
        property_id: property._id,
        room_id: room?._id,
        booking_id: booking._id,
        reason
      }
    });

    // Send email notification
    try {
      const userEmail = booking.userSnapshot?.email || await this.getUserEmail(booking.userId);
      if (userEmail) {
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
              .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
              .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .reason-box { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
              .detail-row:last-child { border-bottom: none; }
              .label { color: #6b7280; }
              .value { font-weight: bold; color: #111827; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0; font-size: 28px;">Booking Update</h1>
              </div>
              <div class="content">
                <p style="font-size: 18px; color: #111827;">Dear ${booking.userSnapshot?.name || 'Valued Guest'},</p>
                <p>We regret to inform you that your booking request has been declined by the property owner.</p>
                
                <div class="details">
                  <h3 style="margin-top: 0; color: #111827;">Booking Details</h3>
                  <div class="detail-row">
                    <span class="label">Property:</span>
                    <span class="value">${property.property_name}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">Room Number:</span>
                    <span class="value">${room?.room_number || 'N/A'}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">Room Type:</span>
                    <span class="value">${room?.room_type || 'N/A'}</span>
                  </div>
                </div>

                ${reason ? `
                  <div class="reason-box">
                    <strong style="color: #991b1b;">Reason:</strong>
                    <p style="margin: 5px 0 0 0; color: #7f1d1d;">${reason}</p>
                  </div>
                ` : ''}

                <p><strong>What You Can Do:</strong></p>
                <ul>
                  <li>Browse other available properties on Lyvo+</li>
                  <li>Contact our support team for assistance</li>
                  <li>Update your preferences and search again</li>
                </ul>

                <p>Don't worry! We have many other great properties available for you.</p>

                <div style="text-align: center;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/seeker-dashboard" class="button">
                    Browse Available Properties
                  </a>
                </div>

                <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
                  If you have any questions, please contact our support team.
                </p>
              </div>
            </div>
          </body>
          </html>
        `;

        await this.sendEmail(
          userEmail,
          `Booking Update - ${property.property_name}`,
          emailHtml
        );
      }
    } catch (emailError) {
      console.error('Error sending rejection email:', emailError);
    }

    return notification;
  }

  /**
   * Send custom message from admin to owner
   */
  static async sendAdminMessageToOwner(ownerId, propertyId, propertyName, message, adminId) {
    return await this.createNotification({
      recipient_id: ownerId,
      recipient_type: 'owner',
      title: '📨 Message from Admin',
      message: message,
      type: 'general',
      related_property_id: propertyId,
      action_url: `/owner-properties/${propertyId}`,
      created_by: adminId,
      metadata: {
        property_name: propertyName,
        property_id: propertyId,
        message_type: 'admin_custom_message'
      }
    });
  }
  /**
   * Notify all admins
   */
  static async notifyAllAdmins({ title, message, type, related_id = null, action_url = null, metadata = {} }) {
    try {
      // Find all admins (role 2)
      const admins = await User.find({ role: 2 }).select('_id');

      if (!admins.length) return;

      const notifications = admins.map(admin => ({
        recipient_id: admin._id,
        recipient_type: 'admin',
        title,
        message,
        type,
        related_property_id: type === 'property_approval' ? related_id : null,
        action_url,
        metadata
      }));

      // Bulk insert for efficiency
      await Notification.insertMany(notifications);
      console.log(`✅ Notified ${admins.length} admins: ${title}`);

      // Socket emit loop
      if (global.io) {
        admins.forEach(admin => {
          global.io.to(`user_${admin._id}`).emit('new_notification', { title, message, type });
        });
      }

    } catch (error) {
      console.error('Error notifying admins:', error);
    }
  }
}

module.exports = NotificationService;
