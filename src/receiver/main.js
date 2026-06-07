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

  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      remoteVideo.style.display = "block";
      statusEl.innerText = "Streaming active!";

      remoteVideo.muted = true;
      remoteVideo.play().catch(console.error);
      remoteVideo.classList.add('tv-fullscreen-active');
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

  const finalizedSdp = isLowEndDevice ? forceStrictH264Only(offerSdpText) : offerSdpText;

  const offerDesc = new RTCSessionDescription({ type: 'offer', sdp: finalizedSdp });
  peerConnection.setRemoteDescription(offerDesc)
    .then(() => peerConnection.createAnswer())
    .then(answer => peerConnection.setLocalDescription(answer))
    .catch(console.error);
}

function forceStrictH264Only(sdp) {
  const lines = sdp.split(/\r?\n/);

  const mVideoIndex = lines.findIndex(line => line.startsWith('m=video'));
  if (mVideoIndex === -1) return sdp;

  const excludedPayloads = [];
  lines.forEach(line => {
    if (line.startsWith('a=rtpmap:')) {
      const match = line.match(/a=rtpmap:(\d+)\s+(VP8|VP9|AV1)/i);
      if (match) {
        excludedPayloads.push(match[1]);
      }
    }
  });

  lines.forEach(line => {
    if (line.startsWith('a=fmtp:')) {
      const colonIndex = line.indexOf(':');
      const spaceIndex = line.indexOf(' ', colonIndex);
      if (spaceIndex !== -1) {
        const rtxPayloadId = line.substring(colonIndex + 1, spaceIndex).trim();
        const aptMatch = line.match(/apt=(\d+)/i);

        if (aptMatch) {
          const basePayloadId = aptMatch[1];
          if (excludedPayloads.includes(basePayloadId) && !excludedPayloads.includes(rtxPayloadId)) {
            excludedPayloads.push(rtxPayloadId);
          }
        }
      }
    }
  });

  if (excludedPayloads.length === 0) return sdp;

  const mVideoParts = lines[mVideoIndex].split(' ');
  const header = mVideoParts.slice(0, 3);
  const payloads = mVideoParts.slice(3);

  const allowedPayloads = payloads.filter(p => !excludedPayloads.includes(p));

  if (allowedPayloads.length === 0) return sdp;

  lines[mVideoIndex] = [...header, ...allowedPayloads].join(' ');

  const finalizedLines = lines.filter(line => {
    if (line.startsWith('a=rtpmap:') || line.startsWith('a=fmtp:') || line.startsWith('a=rtcp-fb:')) {
      const colonIndex = line.indexOf(':');
      const spaceIndex = line.indexOf(' ', colonIndex);
      const endOfId = spaceIndex !== -1 ? spaceIndex : line.length;
      const payloadId = line.substring(colonIndex + 1, endOfId).trim();

      if (excludedPayloads.includes(payloadId)) {
        return false;
      }
    }
    return true;
  });
  return finalizedLines.join('\r\n');
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