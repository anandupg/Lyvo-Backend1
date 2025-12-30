const handleSocketConnection = (io) => {
    io.on('connection', (socket) => {
        console.log(`🔌 Socket connected: ${socket.id} (User: ${socket.user?.id || 'Anonymous'})`);

        // Join user-specific room for personal notifications
        if (socket.user && socket.user.id) {
            const userRoom = `user_${socket.user.id}`;
            socket.join(userRoom);
            console.log(`👤 User ${socket.user.id} joined room: ${userRoom}`);
        }

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log(`❌ Socket disconnected: ${socket.id}`);
        });

        // Example: Client sending a notification (if needed for testing/chat)
        socket.on('send_notification', (data) => {
            // In a real app, you'd validate and save this.
            // For now, valid merely echoing back or broadcasting
            console.log('📨 Notification sent from client:', data);

            // Example: Broadcast to a specific user if targetUserId is provided
            if (data.targetUserId) {
                io.to(`user_${data.targetUserId}`).emit('new_notification', {
                    title: data.title,
                    message: data.message,
                    senderId: socket.user.id,
                    timestamp: new Date()
                });
            }
        });
    });
};

module.exports = handleSocketConnection;
