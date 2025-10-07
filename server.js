// server.js (WebRTC signaling server using Socket.IO)
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  // Join a room (for 1:1, use a fixed room)
  socket.on('join', (room) => {
    socket.join(room);
    socket.to(room).emit('peer-joined');
  });

  // Relay signaling messages
  socket.on('signal', ({ room, data }) => {
    socket.to(room).emit('signal', data);
  });

  socket.on('disconnect', () => {
    // Notify peers
    // (optional: implement if you want to handle disconnects)
  });
});

const PORT = 4000;
server.listen(PORT, () => {
  console.log('WebRTC signaling server running on http://localhost:' + PORT);
});