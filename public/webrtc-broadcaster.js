// public/webrtc-broadcaster.js
// Immediate-start broadcaster: grabs camera ASAP and creates a room quickly.
const pcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const socket = io(); // ensure socket.io script is loaded before this runs (see placement note)

let localStream = null;
let myRoomId = null;
const peerConnections = new Map();

// Ensure there's a video element we can attach the preview to
function ensureVideoElement() {
  let vid = document.getElementById('videoFeed');
  if (!vid) {
    vid = document.createElement('video');
    vid.id = 'videoFeed';
    vid.muted = true; // important for autoplay
    vid.autoplay = true;
    vid.playsInline = true;
    vid.style.width = '1px';
    vid.style.height = '1px';
    vid.style.opacity = '0';
    vid.style.position = 'absolute';
    vid.style.left = '-9999px';
    document.body.appendChild(vid);
  } else {
    vid.muted = true; // enforce muted
  }
  return vid;
}

const videoEl = ensureVideoElement();
const status = document.getElementById('broadcaster-status') || { textContent: '' };

function setStatus(text) {
  if (status && status.textContent !== undefined) status.textContent = text;
  console.log('[BROADCASTER] ' + text);
}

async function startBroadcast() {
  setStatus('Starting camera...');
  try {
    // lower-res constraints to speed up camera initialization — tweak if you want higher quality
    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 360 },
        facingMode: 'user'
      },
      audio: false // change if you want audio; note audio may block autoplay unless muted
    };

    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = localStream;
    setStatus('Camera started. Connecting to signaling...');

    // connect socket is already created above; wait for connect
    if (socket.connected) {
      onSocketConnected();
    } else {
      socket.once('connect', onSocketConnected);
    }
  } catch (err) {
    console.error('Camera error', err);
    setStatus('Camera error: ' + (err.message || err));
  }
}

function onSocketConnected() {
  setStatus('Signaling connected. Creating room...');
  // Create room immediately
  socket.emit('create-room');
}

// server will respond with 'room-created'
socket.on('room-created', (roomId) => {
  myRoomId = roomId;
  setStatus(`Room created: ${roomId}. Waiting for viewers...`);
});

// Handle viewer join -> create a dedicated peer connection for them
socket.on('peer-joined', async (viewerId) => {
  setStatus('Viewer joined — setting up connection...');
  const pc = new RTCPeerConnection(pcConfig);
  peerConnections.set(viewerId, pc);

  // add local tracks
  if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { room: myRoomId, to: viewerId, data: { candidate: event.candidate } });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('PC state for', viewerId, pc.connectionState);
    if (pc.connectionState === 'connected') setStatus('Viewer connected! Streaming...');
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') setStatus('Viewer disconnected');
  };

  // Create & send offer immediately (no extra waits)
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { room: myRoomId, to: viewerId, data: { sdp: pc.localDescription } });
  } catch (err) {
    console.error('Error creating offer', err);
  }
});

// incoming signals include { from, data }
socket.on('signal', async ({ from, data }) => {
  try {
    // find pc by 'from' (broadcaster uses from when receiving answers/candidates)
    const pc = peerConnections.get(from) || [...peerConnections.values()].find(p => p.connectionState !== 'connected');
    if (!pc) {
      console.warn('No PC found for incoming signal; ignoring');
      return;
    }
    if (data.sdp) {
      if (data.sdp.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        console.log('Set remote answer');
      }
    }
    if (data.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  } catch (err) {
    console.error('Signal handling error', err);
  }
});

// start immediately when this script is parsed
// if you want to delay on some conditions, change this call
startBroadcast().catch(err => {
  console.error('Failed to start broadcast', err);
});
