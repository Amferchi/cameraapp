// server.js (WebRTC signaling server using Socket.IO)
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const session = require('express-session');
const { v4: uuidV4 } = require('uuid');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const metaFile = path.join(__dirname, 'meta.json');

// Middleware (MUST be before routes that use req.body / req.session)
app.use(express.json());
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));

// Simple auth middleware that behaves nicely for API requests
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) return next();

    // If it's an API/XHR call, return JSON 401 so fetch() can handle it
    const acceptsJson = (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)
        || req.xhr
        || req.path.startsWith('/api/');
    if (acceptsJson) return res.status(401).json({ error: 'unauthorized' });

    // For normal page loads, redirect to login
    return res.redirect('/login.html');
}

// Helper: load or create meta.json (avoid referencing PORT here)
function loadMeta() {
    try {
        const raw = fs.readFileSync(metaFile, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        const defaultMeta = {
            title: 'My Live Stream',
            description: 'Live streaming app',
            image: '',
            url: process.env.PUBLIC_URL || ''
        };
        try { fs.writeFileSync(metaFile, JSON.stringify(defaultMeta, null, 2)); } catch (err) {}
        return defaultMeta;
    }
}

function saveMeta(meta) {
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
}

// Public meta endpoint
app.get('/api/meta', (req, res) => {
    const meta = loadMeta();
    res.json(meta);
});

// Protected meta update endpoint
// Protected meta update endpoint (replace your existing /api/meta POST)
app.post('/api/meta', requireAuth, (req, res) => {
  const { title, description, image, url, iframeSrc } = req.body || {};

  if (!title || !description) {
    return res.status(400).json({ success: false, message: 'title and description required' });
  }

  // Optional: validate iframeSrc so admin can't save a javascript: URL or data: URL
  let sanitizedIframe = '';
  if (iframeSrc && typeof iframeSrc === 'string' && iframeSrc.trim() !== '') {
    const trimmed = iframeSrc.trim();
    // Allow only http or https src (simple whitelist)
    if (!/^https?:\/\//i.test(trimmed)) {
      return res.status(400).json({ success: false, message: 'iframeSrc must be an absolute http(s) URL' });
    }
    sanitizedIframe = trimmed;
  }

  const meta = loadMeta();
  meta.title = title;
  meta.description = description;
  meta.image = image || meta.image;
  meta.url = url || meta.url;
  meta.iframeSrc = sanitizedIframe || meta.iframeSrc || ''; // persist iframeSrc

  saveMeta(meta);

  io.emit('meta-updated', meta);

  res.json({ success: true, meta });
});


// Auth check for client (used to show admin UI)
app.get('/api/auth', (req, res) => {
    res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

// --- In-memory active rooms store
const activeRooms = new Map();

// Serve protected pages (rooms & viewer)
app.get('/rooms.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'rooms.html'));
});

app.get('/viewer.html', requireAuth, (req, res) => {
    const { room } = req.query;
    if (!room || !activeRooms.has(room)) return res.redirect('/rooms.html');
    res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// Login endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // Replace with real user check in production
    if (username === 'admin' && password === 'password') {
        req.session.authenticated = true;
        return res.json({ success: true, redirect: '/rooms.html' });
    }
    return res.json({ success: false, message: 'Invalid credentials' });
});

// Rooms API
app.get('/api/rooms', requireAuth, (req, res) => {
    const roomsArray = Array.from(activeRooms.entries()).map(([roomId, data]) => ({
        roomId,
        name: data.name
    }));
    res.json(roomsArray);
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

// Serve the index template with injected meta for crawlers/social previews
app.get('/', (req, res) => {
    const templatePath = path.join(__dirname, 'public', 'index.template.html');
    let html = fs.readFileSync(templatePath, 'utf8');
    const meta = loadMeta();

    // Build an absolute image URL for crawlers if the saved meta.image is relative
    let imageUrl = meta.image || '';
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
        // ensure no leading slash duplication
        imageUrl = `${req.protocol}://${req.get('host')}/${imageUrl.replace(/^\/+/, '')}`;
    }

    // infer mime-type from extension (simple heuristic)
    let imageType = '';
    if (imageUrl.match(/\.png(\?.*)?$/i)) imageType = 'image/png';
    else if (imageUrl.match(/\.webp(\?.*)?$/i)) imageType = 'image/webp';
    else if (imageUrl.match(/\.(gif|jpeg|jpg)(\?.*)?$/i)) imageType = 'image/jpeg';

    html = html.replace(/%META_TITLE%/g, escapeHtml(meta.title || ''));
    html = html.replace(/%META_DESCRIPTION%/g, escapeHtml(meta.description || ''));
    html = html.replace(/%META_IMAGE%/g, escapeHtml(imageUrl || ''));
    html = html.replace(/%META_IMAGE_SECURE%/g, escapeHtml(imageUrl || ''));
    html = html.replace(/%META_IMAGE_TYPE%/g, escapeHtml(imageType || ''));
    html = html.replace(/%META_URL%/g, escapeHtml(meta.url || ''));
    html = html.replace(/%IFRAME_SRC%/g, escapeHtml(meta.iframeSrc || 'https://abcnews.go.com'));
    res.send(html);
});


// Serve meta editor page (separate mobile-friendly editor)
app.get('/meta-editor.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'meta-editor.html'));
});


// Simple escape helper
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Static files after dynamic index route
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO logic
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('create-room', () => {
        const roomId = uuidV4();
        socket.join(roomId);

        activeRooms.set(roomId, {
            broadcasterId: socket.id,
            name: `Stream ${roomId.substring(0, 6)}`
        });

        socket.emit('room-created', roomId);

        // emit consistent array-of-objects shape
        io.emit('rooms-updated', Array.from(activeRooms.entries()).map(([roomId, data]) => ({
            roomId,
            name: data.name
        })));
        console.log(`Room created: ${roomId} by ${socket.id}`);
    });

    socket.on('join', (room) => {
        socket.join(room);
        socket.to(room).emit('peer-joined', socket.id);
    });

    // routed signaling: include 'to' for direct routing, include 'from' when emitting
    socket.on('signal', ({ room, data, to }) => {
        if (to) {
            io.to(to).emit('signal', { from: socket.id, data });
        } else if (room) {
            socket.to(room).emit('signal', { from: socket.id, data });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
        for (const [roomId, roomData] of activeRooms.entries()) {
            if (roomData.broadcasterId === socket.id) {
                activeRooms.delete(roomId);
                io.emit('rooms-updated', Array.from(activeRooms.entries()).map(([roomId, data]) => ({
                    roomId,
                    name: data.name
                })));
                console.log(`Room closed: ${roomId}`);
                break;
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log('WebRTC signaling server running on http://localhost:' + PORT);
});
