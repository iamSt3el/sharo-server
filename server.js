// server.js - Updated version with fixed QR code redirection
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

// *** FIXED: Improved QR code route handling ***
// Handle /receive route and redirect to the frontend
app.get('/receive', (req, res) => {
  const roomId = req.query.room;
  
  if (!roomId) {
    return res.status(400).send('Missing room parameter');
  }
  
  // Get the frontend URL from environment variable or use default
  // THIS IS IMPORTANT: Set this environment variable in your Render.com dashboard
  const frontendUrl = process.env.FRONTEND_URL || 'https://sharo.onrender.com/';
  
  // Redirect to the frontend with the room parameter
  const redirectUrl = `${frontendUrl}/receive?room=${roomId}`;
  console.log(`Redirecting QR code scan to: ${redirectUrl}`);
  
  res.redirect(301, redirectUrl);
});

// API routes
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'Signaling server is running', 
    rooms: Object.keys(rooms).length,
    mode: 'redirect-mode'
  });
});

// Basic route for root
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Sharo P2P File Sharing - Server</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
          h1 { color: #333; }
          a { color: #0066cc; }
          .container { border: 1px solid #ddd; padding: 20px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Sharo P2P File Sharing</h1>
          <p>This is the signaling server for Sharo P2P File Sharing application.</p>
          <p>To use the application, please visit: <a href="${process.env.FRONTEND_URL || 'https://sharo.onrender.com/'}" target="_blank">${process.env.FRONTEND_URL || 'https://sharo.onrender.com/'}</a></p>
          <p>Server Status: Running</p>
          <p>Active Rooms: ${Object.keys(rooms).length}</p>
          <p>QR Code Redirect URL: <code>${process.env.FRONTEND_URL || 'https://sharo.onrender.com/'}/receive?room=[ROOM_ID]</code></p>
        </div>
      </body>
    </html>
  `);
});

// Add a diagnostic route to check if redirection works
app.get('/check-redirect', (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://sharo.onrender.com/';
  res.json({
    status: 'ok',
    frontendUrl: frontendUrl,
    redirectEndpoint: '/receive',
    fullRedirectExample: `${frontendUrl}/receive?room=example-room-123`,
    note: 'This endpoint helps diagnose if the redirection is working properly'
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`QR Code redirection mode active.`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'https://sharo.onrender.com/'}`);
});