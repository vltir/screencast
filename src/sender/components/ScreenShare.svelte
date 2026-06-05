<script>
  import { onMount, onDestroy } from 'svelte';
  import 'webrtc-adapter';
  import { pad20, deriveTrackerRoomId, encryptText, decryptText } from '../../shared/crypto-utils.js';

  let { bip39String } = $props();

  let statusText = $state('Initialisiere Medienfreigabe...');
  let isTransmissionActive = $state(false);
  let previewVideoEl = $state(null);

  const trackerUrl = 'wss://tracker.openwebtorrent.com';
  const webrtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

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

  // Safely assign the media stream to the video element property via Svelte 5 effect context
  $effect(() => {
    if (isTransmissionActive && previewVideoEl && localStream) {
      if (previewVideoEl.srcObject !== localStream) {
        previewVideoEl.srcObject = localStream;
      }
    }
  });

  function startScreenCapture() {
    statusText = "Frage Bildschirm-Berechtigung an...";
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
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
        isTransmissionActive = true;
      });
  }
</script>

<div class="status-container">
  {#if !isTransmissionActive}
    <div class="spinner"></div>
  {:else}
    <video
      bind:this={previewVideoEl}
      class="preview-video"
      autoplay
      playsinline
      muted
    ></video>
  {/if}
  <p class="status-text">{statusText}</p>
</div>

<style>
  .status-container {
    width: min(720px, 100%);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
  }

  .status-text {
    margin: 0;
    color: var(--muted);
    font-size: 15px;
    font-style: italic;
    text-align: center;
    line-height: 1.5;
  }

  .spinner {
    width: 42px;
    height: 42px;
    border: 3px solid var(--panel-soft);
    border-top: 3px solid var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .preview-video {
  width: 100%;
  height: auto;
  max-height: 380px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: transparent;
}

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>