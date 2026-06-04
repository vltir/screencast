import { decryptText } from '../shared/crypto-utils.js';

export function initializeReceiver({ activeInfoHash, myPeerId, currentSecretKey, onSignalReceived, onStatusChange }) {
  const trackerUrl = 'wss://tracker.webtorrent.dev';
  let ws = null;
  let announceInterval = null;

  function sendAnnounce(extraPayload) {
    const base = { action: "announce", info_hash: activeInfoHash, peer_id: myPeerId, numwant: 1 };
    if (!extraPayload) base.offers = [];
    const finalPayload = Object.assign(base, extraPayload);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(finalPayload));
  }

  function connectToTracker() {
    onStatusChange("Waiting for a sender...");
    ws = new WebSocket(trackerUrl);

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
        onStatusChange("Signal received. Decrypting...");
        try {
          const decryptedSdp = decryptText(currentSecretKey, data.offer.sdp);
          if (!decryptedSdp || decryptedSdp.indexOf("v=0") === -1) throw new Error();
          onSignalReceived(decryptedSdp, data.peer_id, data.offer_id, sendAnnounce);
        } catch (err) {
          onStatusChange("Crypto Error: Failed to decrypt sender data.");
        }
      }
    };

    ws.onclose = () => {
      clearInterval(announceInterval);
      setTimeout(connectToTracker, 4000);
    };
  }

  connectToTracker();
}