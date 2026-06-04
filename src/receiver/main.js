import 'webrtc-adapter';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { pad20, deriveTrackerRoomId, encryptText, decryptText } from '../shared/crypto-utils.js';

const wordsContainer = document.getElementById('wordsContainer');
const qrContainer = document.getElementById('qrContainer');
const statusEl = document.getElementById('status');
const remoteVideo = document.getElementById('remoteVideo');

// Select 4 safe words
const selectedWords = [];
for (let i = 0; i < 4; i++) {
  const randomIndex = Math.floor(Math.random() * 2048);
  selectedWords.push(wordlist[randomIndex]);
}

const currentSecretKey = selectedWords.join(' ').toLowerCase();

// Render the words into separate modern pill spans matching the repository style
wordsContainer.innerHTML = selectedWords.map(word => `<span>${word}</span>`).join('');

// Generate a safe text-based QR code URL using a public serverless API to avoid local canvas/buffer bugs
const shareUrl = window.location.origin + '/share.html?room=' + encodeURIComponent(currentSecretKey.split(' ').join('-'));
qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(shareUrl)}" alt="Pairing QR">`;

const activeInfoHash = deriveTrackerRoomId(currentSecretKey);
const myPeerId = pad20('peer-' + Math.random().toString(36).substring(2, 7).toUpperCase());
const webrtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

let ws;
let peerConnection;
let announceInterval;

function connectToTracker() {
  statusEl.innerText = "Waiting for a sender...";
  ws = new WebSocket('wss://tracker.webtorrent.dev');

  ws.onopen = () => {
    sendAnnounce();
    if (announceInterval) clearInterval(announceInterval);
    announceInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) sendAnnounce();
    }, 15000);
  };

  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.offer && data.offer.sdp) {
      statusEl.innerText = "Signal received. Decrypting...";
      try {
        const decryptedSdp = decryptText(currentSecretKey, data.offer.sdp);
        if (!decryptedSdp || decryptedSdp.indexOf("v=0") === -1) throw new Error();
        handleRemoteOffer(decryptedSdp, data.peer_id, data.offer_id);
      } catch (err) {
        statusEl.innerText = "Crypto Error: Failed to decrypt sender data.";
      }
    }
  };

  ws.onclose = () => {
    clearInterval(announceInterval);
    setTimeout(connectToTracker, 4000);
  };
}

function sendAnnounce(extraPayload) {
  const base = { action: "announce", info_hash: activeInfoHash, peer_id: myPeerId, numwant: 1 };
  if (!extraPayload) base.offers = [];
  const finalPayload = Object.assign(base, extraPayload);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(finalPayload));
}

function handleRemoteOffer(offerSdpText, senderPeerId, incomingOfferId) {
  if (peerConnection) return;
  peerConnection = new RTCPeerConnection(webrtcConfig);

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
        answer: { type: "answer", sdp: encryptedSdp }
      });
    }
  };

  const offerDesc = new RTCSessionDescription({ type: 'offer', sdp: offerSdpText });
  peerConnection.setRemoteDescription(offerDesc)
    .then(() => peerConnection.createAnswer())
    .then(answer => peerConnection.setLocalDescription(answer))
    .catch(console.error);
}

connectToTracker();