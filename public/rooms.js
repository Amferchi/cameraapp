// public/rooms.js
const socket = io();
const statusEl = document.getElementById('status');
const roomList = document.getElementById('room-list');

function renderRooms(rooms) {
    // Normalize rooms into objects { roomId, name }
    if (!Array.isArray(rooms) || rooms.length === 0) {
        statusEl.textContent = 'No active streams.';
        roomList.innerHTML = '';
        return;
    }

    statusEl.textContent = 'Active streams:';
    roomList.innerHTML = rooms.map(r => {
        const roomId = (typeof r === 'string') ? r : r.roomId;
        const name = (typeof r === 'string') ? `Stream ${roomId.substring(0,6)}` : (r.name || `Stream ${roomId.substring(0,6)}`);
        // link to viewer page with room query param
        return `<li>
                    <a href="/viewer.html?room=${roomId}">${escapeHtml(name)}</a>
                    <button data-room="${roomId}" class="join-btn" style="margin-left:8px">Join</button>
                </li>`;
    }).join('');

    // wire join buttons
    document.querySelectorAll('.join-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.room;
            window.location.href = `/viewer.html?room=${id}`;
        });
    });
}

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function fetchRooms() {
    try {
        statusEl.textContent = 'Loading active streams...';
        const res = await fetch('/api/rooms', { method: 'GET' });

        // If server redirected to /login.html or returned 401, redirect client to login
        if (res.status === 401 || res.redirected) {
            window.location.href = '/login.html';
            return;
        }

        const rooms = await res.json();
        renderRooms(rooms);
    } catch (err) {
        console.error('Failed to fetch rooms:', err);
        statusEl.textContent = 'Error loading streams. Check console / server.';
    }
}

// Socket events: immediate update and realtime updates
socket.on('connect', () => {
    fetchRooms(); // initial
});
socket.on('rooms-updated', (data) => {
    // Accept either: ['roomId', ...]  OR  [{roomId, name}, ...]
    if (!data) {
        renderRooms([]);
        return;
    }
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'string') {
        // convert to objects for nice display
        renderRooms(data.map(id => ({ roomId: id, name: `Stream ${id.substring(0,6)}`})));
    } else {
        renderRooms(data);
    }
});

// Poll fallback in case socket connect misses something
setInterval(fetchRooms, 10000);
