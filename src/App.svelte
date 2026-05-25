<script>
  import { onDestroy, onMount } from 'svelte'
  import { generateMnemonic } from '@scure/bip39'
  import { wordlist } from '@scure/bip39/wordlists/english.js'
  import { getRelaySockets, joinRoom, selfId } from 'trystero/nostr'
  import QRCode from 'qrcode'
  import ReceiverView from './lib/ReceiverView.svelte'
  import SenderView from './lib/SenderView.svelte'
  import VideoPlayer from './lib/VideoPlayer.svelte'

  const config = { appId: 'serverless-screencast' }
  const wordSet = new Set(wordlist)

  let role = 'receiver'
  let roomSecret = ''
  let roomParam = ''
  let qrCodeUrl = ''
  let shareUrl = ''
  let status = ''
  let error = ''
  let diagnostics = []
  let localStream = null
  let remoteStream = null
  let room = null
  let relayTimer = null
  let lastRelaySnapshot = ''

  const normalizeSecret = (secret) =>
    secret
      .toLowerCase()
      .replace(/[\s-]+/g, ' ')
      .trim()

  const toParamSecret = (secret) => normalizeSecret(secret).split(' ').join('-')
  const fromParamSecret = (param) => param.toLowerCase().replace(/-+/g, ' ').trim()

  const isValidSecret = (secret) => {
    const words = normalizeSecret(secret).split(' ').filter(Boolean)
    return words.length === 12 && words.every((word) => wordSet.has(word))
  }

  const buildShareUrl = (param) =>
    `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(param)}`

  const hashSecret = async (secret) => {
    const data = new TextEncoder().encode(normalizeSecret(secret))
    const digest = await crypto.subtle.digest('SHA-256', data)
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  }

  const cleanupRoom = () => {
    room?.leave?.()
    room = null
  }

  const stopRelayMonitor = () => {
    if (relayTimer) {
      clearInterval(relayTimer)
      relayTimer = null
    }
  }

  const logDiagnostic = (message, details) => {
    const timestamp = new Date().toLocaleTimeString()
    diagnostics = [...diagnostics, `${timestamp} ${message}`].slice(-40)
    if (details !== undefined) {
      console.info('[trystero]', message, details)
    } else {
      console.info('[trystero]', message)
    }
  }

  const relayStateLabel = (state) => {
    if (state === 0) return 'connecting'
    if (state === 1) return 'open'
    if (state === 2) return 'closing'
    if (state === 3) return 'closed'
    return 'unknown'
  }

  const snapshotRelays = () => {
    const sockets = getRelaySockets?.()
    if (!sockets) return ''
    const entries = Object.entries(sockets).map(([url, socket]) => {
      return `${url}=${relayStateLabel(socket?.readyState)}`
    })
    return entries.join(' | ')
  }

  const updateRelayDiagnostics = () => {
    const snapshot = snapshotRelays()
    if (snapshot && snapshot !== lastRelaySnapshot) {
      lastRelaySnapshot = snapshot
      logDiagnostic(`Relays: ${snapshot}`)
    }
  }

  const startRelayMonitor = () => {
    stopRelayMonitor()
    updateRelayDiagnostics()
    relayTimer = setInterval(updateRelayDiagnostics, 4000)
  }

  const stopStream = (stream) => {
    stream?.getTracks().forEach((track) => track.stop())
  }

  const resetStreams = () => {
    stopStream(localStream)
    localStream = null
    remoteStream = null
  }

  const joinRoomWithDiagnostics = (roomId, label) => {
    return joinRoom(config, roomId, {
      handshakeTimeoutMs: 30000,
      onJoinError: (details) => {
        const message = details?.error?.message ?? details?.error ?? 'unknown error'
        logDiagnostic(`${label} join error: ${message}`, details)
        error = 'Connection failed. Check relay status in diagnostics.'
        status = ''
      },
    })
  }

  const initReceiverFlow = async (secret) => {
    cleanupRoom()
    resetStreams()
    stopRelayMonitor()
    error = ''
    status = 'Waiting for a sender…'
    roomSecret = normalizeSecret(secret)
    roomParam = toParamSecret(roomSecret)
    shareUrl = buildShareUrl(roomParam)
    qrCodeUrl = await QRCode.toDataURL(shareUrl, { margin: 1, width: 480 })
    const roomHash = await hashSecret(roomSecret)
    room = joinRoomWithDiagnostics(roomHash, 'receiver')
    logDiagnostic(`Receiver ready (selfId=${selfId})`)
    startRelayMonitor()
    room.onPeerJoin = (peerId) => {
      logDiagnostic(`Peer joined: ${peerId}`)
    }
    room.onPeerLeave = (peerId) => {
      logDiagnostic(`Peer left: ${peerId}`)
    }
    room.onPeerStream = (stream) => {
      logDiagnostic('Received remote stream')
      remoteStream = stream
      role = 'connected'
      const [track] = stream.getVideoTracks()
      if (track) {
        track.addEventListener('ended', () => {
          remoteStream = null
          role = 'receiver'
          status = 'Waiting for a sender…'
        })
      }
    }
  }

  const startSenderFlow = async (secret) => {
    cleanupRoom()
    resetStreams()
    stopRelayMonitor()
    error = ''
    const normalized = normalizeSecret(secret)
    if (!isValidSecret(normalized)) {
      error = 'Please enter 12 valid BIP39 words.'
      status = ''
      return
    }
    roomSecret = normalized
    roomParam = toParamSecret(normalized)
    status = 'Requesting screen share…'
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      })
      localStream = stream
      role = 'connected'
      status = 'Connecting to receiver…'
      const roomHash = await hashSecret(normalized)
      room = joinRoomWithDiagnostics(roomHash, 'sender')
      logDiagnostic(`Sender ready (selfId=${selfId})`)
      startRelayMonitor()
      room.onPeerJoin = (peerId) => {
        logDiagnostic(`Peer joined: ${peerId}`)
        if (localStream) {
          room.addStream(localStream, { target: peerId })
        }
      }
      room.onPeerLeave = (peerId) => {
        logDiagnostic(`Peer left: ${peerId}`)
      }
      room.addStream(stream)
      logDiagnostic('Local stream shared')
      status = 'Sharing screen…'
      const [track] = stream.getVideoTracks()
      if (track) {
        track.addEventListener('ended', () => {
          status = 'Screen sharing stopped.'
          role = 'sender-manual'
          resetStreams()
        })
      }
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        error = 'Screen sharing was blocked. Please allow it in the dialog.'
      } else {
        error = err?.message ?? 'Screen sharing failed.'
      }
      status = ''
    }
  }

  const handleShareClick = () => {
    role = 'sender-manual'
    error = ''
    status = ''
  }

  const handleManualStart = (event) => {
    role = 'sender-manual'
    startSenderFlow(event.detail.secret)
  }

  const handleScan = (event) => {
    role = 'sender-manual'
    startSenderFlow(event.detail.secret)
  }

  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.has('room')) {
      const param = urlParams.get('room') ?? ''
      roomSecret = fromParamSecret(param)
      role = 'sender-auto'
      startSenderFlow(roomSecret)
      return
    }
    role = 'receiver'
    const secret = generateMnemonic(wordlist)
    initReceiverFlow(secret)
  })

  onDestroy(() => {
    cleanupRoom()
    resetStreams()
    stopRelayMonitor()
  })
</script>

{#if remoteStream || localStream}
  <VideoPlayer stream={remoteStream || localStream} />
{:else if role === 'receiver'}
  <ReceiverView
    qrCodeUrl={qrCodeUrl}
    secret={roomSecret}
    shareUrl={shareUrl}
    status={status}
    diagnostics={diagnostics}
    on:share={handleShareClick}
  />
{:else}
  <SenderView
    secret={roomSecret}
    wordlist={wordlist}
    status={status}
    error={error}
    mode={role}
    diagnostics={diagnostics}
    on:start={handleManualStart}
    on:scan={handleScan}
  />
{/if}
