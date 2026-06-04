import 'webrtc-adapter';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { pad20, deriveTrackerRoomId, encryptText, decryptText } from '../shared/crypto-utils.js';

const myRoomIdEl = document.getElementById('myRoomId');
const statusEl = document.getElementById('status');
const remoteVideo = document.getElementById('remoteVideo');

// Generate 4 random BIP39 words safely from the list
const selectedWords = [];
for (let i = 0; i < 4; i++) {
  const randomIndex = Math.floor(Math.random() * 2048);
  selectedWords.push(wordlist[randomIndex]);
}

const currentSecretKey = selectedWords.join(' ').toLowerCase();
myRoomIdEl.innerText = currentSecretKey.toUpperCase();

const activeInfoHash = deriveTrackerRoomId(currentSecretKey);
const myPeerId = pad20('peer-' + Math.random().toString(36).substring(2, 7).toUpperCase());

const webrtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let ws;
let peerConnection;
let announceInterval;

function connectToTracker() {
  statusEl.innerText = "Verbinde mit öffentlichem Tracker...";
  ws = new WebSocket('wss://tracker.webtorrent.dev');

  ws.onopen = () => {
    statusEl.innerText = "TV bereit. Warte auf verschlüsseltes Signal...";
    sendAnnounce();

    if (announceInterval) clearInterval(announceInterval);
    announceInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) sendAnnounce();
    }, 15000);
  };

  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);

    if (data.offer && data.offer.sdp) {
      statusEl.innerText = "Signal erhalten. Entschlüssele...";
      try {
        const decryptedSdp = decryptText(currentSecretKey, data.offer.sdp);
        if (!decryptedSdp || decryptedSdp.indexOf("v=0") === -1) throw new Error();
        handleRemoteOffer(decryptedSdp, data.peer_id, data.offer_id);
      } catch (err) {
        statusEl.style.color = "#ff3333";
        statusEl.innerText = "Fehler: Entschlüsselung fehlgeschlagen.";
      }
    }
  };

  ws.onclose = () => {
    clearInterval(announceInterval);
    setTimeout(connectToTracker, 5000); // Robust auto-reconnect for TV client
  };
}

function sendAnnounce(extraPayload) {
  const base = {
    action: "announce",
    info_hash: activeInfoHash,
    peer_id: myPeerId,
    numwant: 1
  };
  if (!extraPayload) base.offers = [];

  const finalPayload = Object.assign(base, extraPayload);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(finalPayload));
  }
}

function handleRemoteOffer(offerSdpText, senderPeerId, incomingOfferId) {
  if (peerConnection) return;

  peerConnection = new RTCPeerConnection(webrtcConfig);

  remoteVideo.onloadedmetadata = () => {
     statusEl.style.color = "#22b14c";
     statusEl.innerText = "Verschlüsseltes Streaming läuft!";

     // Automated WebOS interaction-less bypass
     remoteVideo.muted = true;
     remoteVideo.play().catch(console.error);
     if (remoteVideo.requestFullscreen) {
       remoteVideo.requestFullscreen().catch(console.error);
     }
  };

  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate === null) {
      statusEl.innerText = "Sende verschlüsselte Antwort zurück...";
      const rawSdp = peerConnection.localDescription.sdp;
      const encryptedSdp = encryptText(currentSecretKey, rawSdp);

      // FIXED: Mixed in the correct activeInfoHash variable instead of the broken reference
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
    .catch(err => console.error(err));
}

connectToTracker();