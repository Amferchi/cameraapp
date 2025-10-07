// webrtc-viewer.js (robust, minimal, fixes for blank video)
const socket = io();
const ROOM = 'webrtc-room';
let pc = null;
const liveFeed = document.getElementById('live-feed');
const statusMessage = document.getElementById('status-message');

function setupWebRTC() {
  pc = new RTCPeerConnection();
  console.log('[Viewer] RTCPeerConnection created');

  pc.ontrack = (event) => {
    console.log('[Viewer] ontrack event:', event);
    if (event.streams && event.streams[0]) {
      liveFeed.srcObject = event.streams[0];
      statusMessage.textContent = 'Streaming Live...';
      console.log('[Viewer] Stream attached to video');
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('[Viewer] Sending ICE candidate');
      socket.emit('signal', { room: ROOM, data: { candidate: event.candidate } });
    } else {
      console.log('[Viewer] ICE candidate gathering complete');
    }
  };

  socket.on('signal', async (data) => {
    try {
      if (data.sdp) {
        console.log('[Viewer] Received SDP', data.sdp.type);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          // Wait for ICE gathering to complete before sending answer
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
          console.log('[Viewer] Sending answer SDP');
          socket.emit('signal', { room: ROOM, data: { sdp: pc.localDescription } });
        }
      }
      if (data.candidate) {
        try {
          console.log('[Viewer] Received ICE candidate from broadcaster');
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          // Ignore duplicate candidate errors
        }
      }
    } catch (err) {
      statusMessage.textContent = 'WebRTC error: ' + err.message;
      console.error('[Viewer] WebRTC error:', err);
    }
  });

  socket.emit('join', ROOM);
}

window.addEventListener('load', setupWebRTC);
