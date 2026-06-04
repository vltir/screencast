import { deriveTrackerRoomId, generateWebTorrentPeerId, decryptSignalData } from '../shared/crypto-utils.js';

export function initializeReceiver({ onRoomGenerated, onSignalReceived, onStatusChange }) {
  const trackerUrl = 'wss://tracker.webtorrent.dev';
  const myPeerId = generateWebTorrentPeerId();

  // Choose 4 random words from the safe @scure/bip39 list
  const selectedWords = [];
  const totalWords = 2048;
  for (let i = 0; i < 4; i++) {
    const randomIndex = Math.floor(Math.random() * totalWords);
    selectedWords.push(window.bip39WordsList[randomIndex]);
  }

  const bip39String = selectedWords.join(' ');
  const infoHash = deriveTrackerRoomId(bip39String);

  let socket = null;
  let announceInterval = null;

  onRoomGenerated(bip39String);

  function sendAnnounce() {
    if (!socket || socket.readyState !== 1) return;

    const payload = {
      action: 'announce',
      info_hash: infoHash,
      peer_id: myPeerId,
      numwant: 1,
      offers: []
    };

    socket.send(JSON.stringify(payload));
  }

  function connect() {
    onStatusChange('Connecting to decentralized tracker...');
    socket = new WebSocket(trackerUrl);

    socket.onopen = () => {
      onStatusChange('TV ready. Waiting for sender signal...');
      sendAnnounce();

      announceInterval = setInterval(() => {
        sendAnnounce();
      }, 15000);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.offer && data.offer.sdp) {
        onStatusChange('Signal received. Decrypting payload...');

        // Decrypt using the robust SJCL string method
        const decryptedSdp = decryptSignalData(data.offer.sdp, bip39String);

        if (decryptedSdp) {
          onSignalReceived(decryptedSdp, data.peer_id, data.offer_id, bip39String, socket);
        } else {
          onStatusChange('Error: Received invalid or corrupted encrypted data.');
        }
      }
    };

    socket.onclose = () => {
      clearInterval(announceInterval);
      onStatusChange('Connection lost. Reconnecting...');
      setTimeout(connect, 5000);
    };
  }

  connect();
}