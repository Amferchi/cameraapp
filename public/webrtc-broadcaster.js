// webrtc-broadcaster.js
// This script runs on index.html (broadcaster)
const socket = io();
const ROOM = 'webrtc-room';
let pc = null;
let localStream = null;

const video = document.getElementById('videoFeed');
const preview = document.getElementById('broadcaster-preview');
const status = document.getElementById('broadcaster-status');

async function startBroadcast() {
  try {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  video.srcObject = localStream;
  if (preview) preview.srcObject = localStream;
  status.textContent = 'Camera started. Waiting for viewer...';
  console.log('[Broadcaster] Camera stream started');
  setupWebRTC();
  } catch (err) {
    status.textContent = 'Camera error: ' + err.message;
  }
}

function setupWebRTC() {
  pc = new RTCPeerConnection();
  localStream.getTracks().forEach(track => {
    console.log('[Broadcaster] Adding track:', track.kind);
    pc.addTrack(track, localStream);
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('[Broadcaster] Sending ICE candidate');
      socket.emit('signal', { room: ROOM, data: { candidate: event.candidate } });
    } else {
      console.log('[Broadcaster] ICE candidate gathering complete');
    }
  };

  socket.on('signal', async (data) => {
    try {
      if (data.sdp && data.sdp.type === 'answer') {
        console.log('[Broadcaster] Received answer SDP');
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        status.textContent = 'Viewer connected! Streaming...';
      }
      if (data.candidate) {
        try {
          console.log('[Broadcaster] Received ICE candidate from viewer');
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          // Ignore duplicate candidate errors
        }
      }
    } catch (err) {
      status.textContent = 'WebRTC error: ' + err.message;
      console.error('[Broadcaster] WebRTC error:', err);
    }
  });

  socket.on('peer-joined', async () => {
    // Viewer joined, create and send offer
    console.log('[Broadcaster] Viewer joined, creating offer');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // Wait for ICE gathering to complete before sending offer
    if (pc.iceGatheringState !== 'complete') {
      await new Promise(resolve => {
        const checkState = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        };
        pc.addEventListener('icegatheringstatechange', checkState);
      });
    }
    console.log('[Broadcaster] Sending offer SDP');
    socket.emit('signal', { room: ROOM, data: { sdp: pc.localDescription } });
    status.textContent = 'Viewer connected. Streaming...';
  });

  socket.emit('join', ROOM);
}

window.addEventListener('load', startBroadcast);
