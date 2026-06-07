import 'webrtc-adapter';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { pad20, deriveTrackerRoomId, encryptText } from '../shared/crypto-utils.js';
import { initializeReceiver } from './tracker-rx.js';

const isLowEndDevice = /Web0S|LG Browser|SmartTV/i.test(navigator.userAgent) ||
                       (/Chrome\/([0-9]+)/.exec(navigator.userAgent)?.[1] < 60);

const wordsContainer = document.getElementById('wordsContainer');
const qrImage = document.getElementById('qrImage');
const shareUrlEl = document.getElementById('shareUrl');
const shareLink = document.getElementById('shareLink');
const statusEl = document.getElementById('status');
const remoteVideo = document.getElementById('remoteVideo');

const selectedWords = [];
for (let i = 0; i < 4; i++) {
  const randomIndex = Math.floor(Math.random() * 2048);
  selectedWords.push(wordlist[randomIndex]);
}

const currentSecretKey = selectedWords.join(' ').toLowerCase();
wordsContainer.innerHTML = selectedWords.map(word => `<span>${word}</span>`).join('');

const baseHref = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
const cleanShareUrl = window.location.origin + baseHref + 'share?room=' + encodeURIComponent(selectedWords.join('-'));

shareUrlEl.innerText = cleanShareUrl;
shareLink.href = baseHref + 'share/';

qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(cleanShareUrl)}`;

const activeInfoHash = deriveTrackerRoomId(currentSecretKey);
const myPeerId = pad20('peer-' + Math.random().toString(36).substring(2, 7).toUpperCase());
const webrtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

let peerConnection;

function handleRemoteOffer(offerSdpText, senderPeerId, incomingOfferId, sendAnnounce) {
  if (peerConnection) return;
  peerConnection = new RTCPeerConnection(webrtcConfig);

  const finalizedSdp = isLowEndDevice ? prioritizeH264(offerSdpText) : offerSdpText;

  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      remoteVideo.style.display = "block";
      statusEl.innerText = "Streaming active!";

      remoteVideo.muted = true;
      remoteVideo.play().catch(console.error);
      if (remoteVideo.requestFullscreen) remoteVideo.requestFullscreen().catch(console.error);
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate === null) {
      statusEl.innerText = "Sending encrypted response back...";
      const encryptedSdp = encryptText(currentSecretKey, peerConnection.localDescription.sdp);
      sendAnnounce({
        to_peer_id: senderPeerId,
        offer_id: incomingOfferId,
        receiver_capabilities: {
          isLowEnd: isLowEndDevice
        },
        answer: { type: "answer", sdp: encryptedSdp }
      });
    }
  };

  const offerDesc = new RTCSessionDescription({ type: 'offer', sdp: finalizedSdp });
  peerConnection.setRemoteDescription(offerDesc)
    .then(() => peerConnection.createAnswer())
    .then(answer => peerConnection.setLocalDescription(answer))
    .catch(console.error);
}

function prioritizeH264(sdp) {
  const lines = sdp.split('\n').map(l => l.trim());
  const mVideoIndex = lines.findIndex(line => line.startsWith('m=video'));
  if (mVideoIndex === -1) return sdp;

  const h264Payloads = [];
  lines.forEach(line => {
    if (line.startsWith('a=rtpmap:') && line.toUpperCase().includes('H264')) {
      const match = line.match(/a=rtpmap:(\d+)/);
      if (match) h264Payloads.push(match[1]);
    }
  });

  if (h264Payloads.length === 0) return sdp;

  const mVideoParts = lines[mVideoIndex].split(' ');
  const header = mVideoParts.slice(0, 3);
  const existingPayloads = mVideoParts.slice(3);

  const newPayloads = [
    ...h264Payloads,
    ...existingPayloads.filter(p => !h264Payloads.includes(p))
  ];

  lines[mVideoIndex] = [...header, ...newPayloads].join(' ');
  return lines.join('\r\n');
}

initializeReceiver({
  activeInfoHash,
  myPeerId,
  currentSecretKey,
  onStatusChange: (statusMessage) => {
    statusEl.innerText = statusMessage;
  },
  onSignalReceived: (offerSdpText, senderPeerId, incomingOfferId, sendAnnounce) => {
    handleRemoteOffer(offerSdpText, senderPeerId, incomingOfferId, sendAnnounce);
  }
});