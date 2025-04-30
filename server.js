// server.js - Updated with correct URL configuration
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Set up Express
const app = express();
app.use(cors({
  origin: '*',
  methods: ["GET", "POST"]
}));

const server = http.createServer(app);

// Create Socket.IO server with CORS configuration
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ["GET", "POST"]
  }
});

// Keep track of active rooms and their participants
const rooms = {};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle room creation and joining
  socket.on('create-room', (roomId) => {
    console.log(`Room created: ${roomId} by user ${socket.id}`);
    socket.join(roomId);
    rooms[roomId] = { creator: socket.id, participants: [socket.id] };
    socket.emit('room-created', roomId);
  });

  socket.on('join-room', (roomId) => {
    if (!rooms[roomId]) {
      socket.emit('error', 'Room does not exist');
      return;
    }
    console.log(`User ${socket.id} joined room ${roomId}`);
    socket.join(roomId);
    rooms[roomId].participants.push(socket.id);
    // Notify room creator that someone joined
    socket.to(rooms[roomId].creator).emit('user-joined', socket.id);
  });

  // WebRTC signaling
  socket.on('offer', ({ roomId, offer }) => {
    console.log(`Offer received in room ${roomId}`);
    socket.to(roomId).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', ({ roomId, answer, to }) => {
    console.log(`Answer sent to ${to} in room ${roomId}`);
    socket.to(to).emit('answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ roomId, candidate, to }) => {
    socket.to(to || roomId).emit('ice-candidate', { candidate, from: socket.id });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove user from all rooms they were in
    for (const roomId in rooms) {
      const room = rooms[roomId];
      // If disconnected user was room creator, notify others and delete room
      if (room.creator === socket.id) {
        io.to(roomId).emit('room-closed');
        delete rooms[roomId];
      }
      // Otherwise just remove from participants list
      else {
        rooms[roomId].participants = room.participants.filter(id => id !== socket.id);
        io.to(room.creator).emit('user-left', socket.id);
      }
    }
  });
});

// *** FIXED: Corrected URL configuration ***
// Handle /receive route and redirect to the frontend
app.get('/receive', (req, res) => {
  const roomId = req.query.room;
  
  if (!roomId) {
    return res.status(400).send('Missing room parameter');
  }
  
  // CORRECT FRONTEND URL - your frontend is at sharo.onrender.com, not sharo-p2p.netlify.app
  const frontendUrl = process.env.FRONTEND_URL || 'https://sharo.onrender.com';
  
  // Redirect to the frontend with the room parameter
  const redirectUrl = `${frontendUrl}/receive?room=${roomId}`;
  console.log(`Redirecting QR code scan to: ${redirectUrl}`);
  
  // Use HTTP 302 redirect for better compatibility
  return res.redirect(302, redirectUrl);
});

// API routes
app.get('/api/status', (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://sharo.onrender.com';
  res.json({ 
    status: 'Signaling server is running', 
    rooms: Object.keys(rooms).length,
    frontendUrl: frontendUrl,
    mode: 'redirect-mode'
  });
});

// Basic route for root
app.get('/', (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://sharo.onrender.com';
  res.send(`
    <html>
      <head>
        <title>Sharo P2P File Sharing - Server</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
          h1 { color: #333; }
          a { color: #0066cc; }
          .container { border: 1px solid #ddd; padding: 20px; border-radius: 5px; }
          .alert { background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 10px; margin: 10px 0; border-radius: 5px; }
          .info { background-color: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; padding: 10px; margin: 10px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Sharo P2P File Sharing - Server</h1>
          <p>This is the signaling server for Sharo P2P File Sharing application.</p>
          
          <div class="info">
            <p><strong>Frontend URL:</strong> ${frontendUrl}</p>
            <p><strong>QR Code Redirect:</strong> Will redirect to: ${frontendUrl}/receive?room=[ROOM_ID]</p>
          </div>
          
          <p>To use the application, please visit: <a href="${frontendUrl}" target="_blank">${frontendUrl}</a></p>
          
          <div class="info">
            <p><strong>Server Status:</strong> Running</p>
            <p><strong>Active Rooms:</strong> ${Object.keys(rooms).length}</p>
          </div>
        </div>
      </body>
    </html>
  `);
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`QR Code redirection mode active.`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'https://sharo.onrender.com'}`);
});