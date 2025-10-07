// webrtc-viewer.js (robust, minimal, fixes for blank video)
const socket = io();
let pc = null;
const liveFeed = document.getElementById('live-feed');
const statusMessage = document.getElementById('status-message');

// NEW: Get the room ID from the URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const ROOM = urlParams.get('room');

// NEW: If no room is specified, redirect to the lobby
if (!ROOM) {
    statusMessage.textContent = 'No room specified. Redirecting to lobby...';
    window.location.href = '/rooms.html';
}

const pcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function setupWebRTC() {
    pc = new RTCPeerConnection(pcConfig);
    console.log('[Viewer] RTCPeerConnection created');

    pc.ontrack = (event) => {
        console.log('[Viewer] ontrack', event);
        if (event.streams && event.streams[0]) {
            liveFeed.srcObject = event.streams[0];
            statusMessage.textContent = 'Streaming Live...';
            console.log('[Viewer] Stream attached to video');
        }
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            // send candidate back to the broadcaster who sent the offer (we'll set `to` from incoming 'from')
            // if we don't know broadcasterId yet, we'll send to room (server will forward)
            if (window._lastOfferFrom) {
                socket.emit('signal', { room: ROOM, to: window._lastOfferFrom, data: { candidate: event.candidate } });
            } else {
                socket.emit('signal', { room: ROOM, data: { candidate: event.candidate } });
            }
        }
    };

    pc.onconnectionstatechange = () => {
        console.log('[Viewer] connectionState', pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            statusMessage.textContent = 'Connection lost';
        }
    };

    // join after creating pc so we are ready to receive offers
    socket.emit('join', ROOM);
}

socket.on('signal', async ({ from, data }) => {
    try {
        // remember who sent the last offer so we can send candidates directly back
        if (from) window._lastOfferFrom = from;

        if (data.sdp) {
            console.log('[Viewer] got sdp', data.sdp.type);
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            if (data.sdp.type === 'offer') {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                // send answer immediately (don't wait for iceGatheringState === 'complete')
                socket.emit('signal', { room: ROOM, to: from, data: { sdp: pc.localDescription } });
                console.log('[Viewer] sent answer back to', from);
            }
        }

        if (data.candidate) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log('[Viewer] added candidate');
            } catch (e) {
                console.warn('addIceCandidate error', e);
            }
        }
    } catch (err) {
        statusMessage.textContent = 'WebRTC error: ' + err.message;
        console.error('[Viewer] WebRTC error', err);
    }
});

if (ROOM) {
    window.addEventListener('load', setupWebRTC);
}