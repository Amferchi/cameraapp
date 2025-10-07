// server.js (WebRTC signaling server using Socket.IO)

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

// Simple auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/login.html');
}

// Serve viewer.html only if logged in
app.get('/viewer.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// Serve meta edit page (if you add one)
// app.get('/meta-edit.html', requireAuth, ...)

// Login API
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  // Replace with real user check
  if (username === 'admin' && password === 'password') {
    req.session.authenticated = true;
    res.json({ success: true, redirect: '/viewer.html' });
  } else {
    res.json({ success: false, message: 'Invalid credentials' });
  }
});

// Logout API
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// Serve static files (index.html, login.html, etc)
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