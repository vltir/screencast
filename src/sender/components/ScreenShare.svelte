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

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.answer && data.answer.sdp) {
        statusText = "Antwort erhalten. Entschlüssele...";

        if (data.receiver_capabilities?.isLowEnd && localStream) {
          statusText = "Low-End Device erkannt.";
          console.log("streaming to low-end device");
          try {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
              await videoTrack.applyConstraints({
                width: {max: 1280},
                height: {max: 720},
                frameRate: {max: 25}
              });
            }
            if (peerConnection) {
              const videoSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
              if (videoSender) {
                const parameters = videoSender.getParameters();
                if (!parameters.encodings) parameters.encodings = [{}];
                parameters.encodings[0].maxBitrate = 1500000;
                await videoSender.setParameters(parameters);
              }
            }
          } catch (err) {
            console.error("Error on throttling the stream:", err);
          }
        }

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
        if (localStream && peerConnection) {
          const videoTrack = localStream.getVideoTracks()[0];
          if (videoTrack) {
            const settings = videoTrack.getSettings();
            setTimeout(() => {
              peerConnection.getStats().then(stats => {
                let negotiatedCodec = "not defined";
                stats.forEach(report => {
                  if (report.type === 'outbound-rtp' && report.kind === 'video' && report.codecId) {
                    const codecReport = stats.get(report.codecId);
                    if (codecReport && codecReport.mimeType) {
                      negotiatedCodec = codecReport.mimeType.toUpperCase().replace("VIDEO/", "");
                    }
                  }
                });
                const videoSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                const maxBitrate = videoSender?.getParameters()?.encodings?.[0]?.maxBitrate;
                console.table({
                  "resolution": `${settings.width || 'N/A'} x ${settings.height || 'N/A'}`,
                  "framerate": settings.frameRate ? Math.round(settings.frameRate) : 'N/A',
                  "video-codec": negotiatedCodec,
                  "max-bitrate": maxBitrate ? (maxBitrate / 1000000) + " Mbps" : "unlimited",
                  "video-source": videoTrack.label,
                  "track-status": videoTrack.readyState
                });
              }).catch(err => console.error("Error on generating statistics", err));
            }, 500);
          }
        }
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