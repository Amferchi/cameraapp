// webrtc-broadcaster.js
// This script runs on index.html (broadcaster)
const socket = io();
// REMOVED: const ROOM = 'webrtc-room';
let myRoomId = null; // NEW: To store the unique room ID from the server
const peerConnections = new Map(); // NEW: Handle multiple viewers

const video = document.getElementById('videoFeed');
const preview = document.getElementById('broadcaster-preview');
const status = document.getElementById('broadcaster-status');

async function startBroadcast() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        video.srcObject = localStream;
        if (preview) preview.srcObject = localStream;
        status.textContent = 'Camera started. Creating room...';
        
        // NEW: Ask the server to create a room for us
        socket.emit('create-room');

    } catch (err) {
        status.textContent = 'Camera error: ' + err.message;
    }
}

// NEW: Server confirms the room is created
socket.on('room-created', (roomId) => {
    myRoomId = roomId;
    status.textContent = `Room created: ${myRoomId}. Waiting for viewers...`;
});


// MODIFIED: When a viewer joins, create a new peer connection for them
const pcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

socket.on('peer-joined', async (viewerId) => {
    console.log(`Viewer ${viewerId} joined`);
    const pc = new RTCPeerConnection(pcConfig);
    peerConnections.set(viewerId, pc);

    // add tracks
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // send candidate to that viewer only
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { room: myRoomId, to: viewerId, data: { candidate: event.candidate } });
        }
    };

    pc.onconnectionstatechange = () => {
        console.log('Broadcaster pc state for', viewerId, pc.connectionState);
    };

    // create & send offer to that viewer only
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { room: myRoomId, to: viewerId, data: { sdp: pc.localDescription } });
});


// incoming signals will include { from, data }
socket.on('signal', async ({ from, data }) => {
    try {
        const pc = peerConnections.get(from);
        if (!pc) {
            console.warn('No peer connection for', from);
            return;
        }
        if (data.sdp && data.sdp.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            console.log('Set remote answer for', from);
        }
        if (data.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (err) {
        console.error('Broadcaster signal error:', err);
    }
});


window.addEventListener('load', startBroadcast);
// Note: The broadcaster's index.html doesn't need changes.