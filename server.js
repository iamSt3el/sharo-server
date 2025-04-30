// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Set up Express
const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST"]
}));

const server = http.createServer(app);

// Create Socket.IO server with CORS configuration
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
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

// API routes
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'Signaling server is running', 
    rooms: Object.keys(rooms).length 
  });
});

// Check if build directory exists
const buildPath = path.join(__dirname, 'build');
const indexPath = path.join(buildPath, 'index.html');
const hasBuildFolder = fs.existsSync(buildPath) && fs.existsSync(indexPath);

if (hasBuildFolder) {
  console.log('Found build directory, serving static files');
  // Serve static files from the 'build' folder if it exists
  app.use(express.static(buildPath));
  
  // Catch-all route that serves the React app for client-side routes
  app.get('*', (req, res) => {
    res.sendFile(indexPath);
  });
} else {
  console.log('No build directory found, running in API-only mode');
  
  // If no build folder, provide info on root route
  app.get('/', (req, res) => {
    res.json({
      message: 'Sharo Signaling Server is running in API-only mode',
      info: 'For full functionality, deploy the React app and add the build folder',
      endpoints: ['/api/status'],
      webSocketEndpoint: '/',
      currentRooms: Object.keys(rooms).length
    });
  });
}

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});