<script>
  import { onMount, onDestroy } from 'svelte';
  import 'webrtc-adapter';
  import { pad20, deriveTrackerRoomId, encryptText, decryptText } from '../../shared/crypto-utils.js';

  let { bip39String } = $props();

  let statusText = $state('Initialisiere Medienfreigabe...');
  const trackerUrl = 'wss://tracker.webtorrent.dev';
  const webrtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  // Svelte 5 Runes for reactive key updates
  const activeInfoHash = $derived(deriveTrackerRoomId(bip39String));
  const currentSecretKey = $derived(bip39String.trim().toLowerCase());
  const myPeerId = pad20('peer-' + Math.random().toString(36).substring(2, 7).toUpperCase());

  let ws;
  let peerConnection;
  let localStream;
  let announceInterval;
  let pendingOfferPayload = null;

  onMount(() => {
    startScreenCapture();
  });

  onDestroy(() => {
    clearInterval(announceInterval);
    if (ws) ws.close();
    if (peerConnection) peerConnection.close();
    if (localStream) localStream.getTracks().forEach(track => track.stop());
  });

  function startScreenCapture() {
    statusText = "Frage Bildschirm-Berechtigung an...";
    navigator.mediaDevices.getDisplayMedia({ video: true })
      .then(stream => {
        localStream = stream;
        connectToTracker();
      })
      .catch(err => {
        statusText = `Screenshare abgebrochen: ${err.message}`;
      });
  }

  function connectToTracker() {
    statusText = "Verbinde mit öffentlichem Tracker...";
    ws = new WebSocket(trackerUrl);

    ws.onopen = () => {
      statusText = "Raum offen. Warte auf Empfänger...";
      initiateWebRTCConnection();

      if (pendingOfferPayload) {
        sendAnnounce(pendingOfferPayload);
        pendingOfferPayload = null;
      }

      if (announceInterval) clearInterval(announceInterval);
      announceInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) sendAnnounce();
      }, 15000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.answer && data.answer.sdp) {
        statusText = "Antwort erhalten. Entschlüssele...";
        try {
          const decryptedSdp = decryptText(currentSecretKey, data.answer.sdp);
          handleRemoteAnswer(decryptedSdp);
        } catch (err) {
          statusText = "Fehler: Kann TV-Antwort nicht entschlüsseln.";
        }
      }
    };
  }

  function sendAnnounce(extraPayload) {
    const base = {
      action: "announce",
      info_hash: activeInfoHash,
      peer_id: myPeerId,
      numwant: 1
    };

    const finalPayload = Object.assign(base, extraPayload);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(finalPayload));
    } else if (ws && ws.readyState === WebSocket.CONNECTING) {
      if (extraPayload) pendingOfferPayload = extraPayload;
    }
  }

  function initiateWebRTCConnection() {
    peerConnection = new RTCPeerConnection(webrtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (event) => {
      if (event.candidate === null) {
        statusText = "Verschlüssele Signal...";
        const rawSdp = peerConnection.localDescription.sdp;
        const encryptedSdp = encryptText(currentSecretKey, rawSdp);

        sendAnnounce({
          offers: [{
            offer_id: pad20('msg-' + Math.random()),
            offer: { type: "offer", sdp: encryptedSdp }
          }]
        });
      }
    };

    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .catch(err => console.error(err));
  }

  function handleRemoteAnswer(answerSdpText) {
    const answerDesc = new RTCSessionDescription({ type: 'answer', sdp: answerSdpText });
    peerConnection.setRemoteDescription(answerDesc)
      .then(() => {
        statusText = "Verbindung gesichert! Übertragung aktiv.";
      });
  }
</script>

<div class="status-box">
  <div class="spinner"></div>
  <p>{statusText}</p>
</div>

<style>
  .status-box { padding: 30px; background: #222; border-radius: 6px; border: 1px solid #444; }
  p { margin: 15px 0 0 0; color: #ccc; font-style: italic; font-size: 15px; }
  .spinner { width: 30px; height: 30px; border: 3px solid #333; border-top: 3px solid #0078d4; border-radius: 50%; margin: 0 auto; animation: spin 1s linear infinite; }
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
</style>