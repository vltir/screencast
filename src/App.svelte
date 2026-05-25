<script>
  import { onDestroy, onMount } from 'svelte'
  import { wordlist } from '@scure/bip39/wordlists/english.js'
  import { joinRoom } from 'trystero/nostr'
  import QRCode from 'qrcode'
  import ReceiverView from './lib/ReceiverView.svelte'
  import SenderView from './lib/SenderView.svelte'
  import VideoPlayer from './lib/VideoPlayer.svelte'

  const config = { appId: 'serverless-screencast' }
  const wordCount = 4
  const wordSet = new Set(wordlist)

  /** @type {'receiver' | 'sender-auto' | 'sender-manual' | 'connected'} */
  let role = 'receiver'
  let roomSecret = ''
  let roomParam = ''
  let qrCodeUrl = ''
  let shareUrl = ''
  let status = ''
  let error = ''
  /** @type {MediaStream | null} */
  let localStream = null
  /** @type {MediaStream | null} */
  let remoteStream = null
  /** @type {ReturnType<typeof joinRoom> | null} */
  let room = null

  /** @param {string} secret */
  const normalizeSecret = (secret) =>
    secret
      .toLowerCase()
      .replace(/[\s-]+/g, ' ')
      .trim()

  /** @param {string} secret */
  const toParamSecret = (secret) => normalizeSecret(secret).split(' ').join('-')
  /** @param {string} param */
  const fromParamSecret = (param) => param.toLowerCase().replace(/-+/g, ' ').trim()

  /** @param {string} secret */
  const isValidSecret = (secret) => {
    const words = normalizeSecret(secret).split(' ').filter(Boolean)
    return (
      words.length === wordCount &&
      words.every(/** @param {string} word */ (word) => wordSet.has(word))
    )
  }

  /** @param {string} param */
  const buildShareUrl = (param) =>
    `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(param)}`

  /** @param {string} secret */
  const hashSecret = async (secret) => {
    const data = new TextEncoder().encode(normalizeSecret(secret))
    const digest = await crypto.subtle.digest('SHA-256', data)
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  }

  /** @param {number} count */
  const generateWords = (count) => {
    const numbers = new Uint32Array(count)
    crypto.getRandomValues(numbers)
    const words = Array.from(numbers, (value) => wordlist[value % wordlist.length])
    return words.join(' ')
  }

  const cleanupRoom = () => {
    room?.leave?.()
    room = null
  }

  /** @param {MediaStream | null} stream */
  const stopStream = (stream) => {
    stream?.getTracks().forEach(
      /** @param {MediaStreamTrack} track */ (track) => track.stop()
    )
  }

  const resetStreams = () => {
    stopStream(localStream)
    localStream = null
    remoteStream = null
  }

  /** @param {string} roomId */
  const joinRoomWithTimeout = (roomId) => {
    return joinRoom(config, roomId, {
      handshakeTimeoutMs: 30000,
      onJoinError: (details) => {
        const message = getErrorMessage(details?.error)
        error = `Connection failed: ${message}`
        status = ''
      },
    })
  }

  /** @param {unknown} err */
  const getErrorMessage = (err) => {
    if (err && typeof err === 'object' && 'message' in err) {
      const message = err.message
      if (typeof message === 'string') return message
    }
    if (typeof err === 'string') return err
    return 'unknown error'
  }

  /** @param {unknown} err */
  const isNotAllowedError = (err) =>
    Boolean(err && typeof err === 'object' && 'name' in err && err.name === 'NotAllowedError')

  /** @param {string} secret */
  const initReceiverFlow = async (secret) => {
    cleanupRoom()
    resetStreams()
    error = ''
    status = 'Waiting for a sender…'
    roomSecret = normalizeSecret(secret)
    roomParam = toParamSecret(roomSecret)
    shareUrl = buildShareUrl(roomParam)
    qrCodeUrl = await QRCode.toDataURL(shareUrl, { margin: 1, width: 480 })
    const roomHash = await hashSecret(roomSecret)
    room = joinRoomWithTimeout(roomHash)
    room.onPeerStream = /** @param {MediaStream} stream */ (stream) => {
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

  /** @param {string} secret */
  const startSenderFlow = async (secret) => {
    cleanupRoom()
    resetStreams()
    error = ''
    const normalized = normalizeSecret(secret)
    if (!isValidSecret(normalized)) {
      error = `Please enter ${wordCount} valid words.`
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
      room = joinRoomWithTimeout(roomHash)
      room.onPeerJoin = /** @param {string} peerId */ (peerId) => {
        if (localStream) {
          room.addStream(localStream, { target: peerId })
        }
      }
      room.addStream(stream)
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
      if (isNotAllowedError(err)) {
        error = 'Screen sharing was blocked. Please allow it in the dialog.'
      } else {
        error = getErrorMessage(err)
      }
      status = ''
    }
  }

  const handleShareClick = () => {
    role = 'sender-manual'
    error = ''
    status = ''
  }

  /** @param {string} secret */
  const handleManualStart = (secret) => {
    role = 'sender-manual'
    startSenderFlow(secret)
  }

  /** @param {string} secret */
  const handleScan = (secret) => {
    role = 'sender-manual'
    startSenderFlow(secret)
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
    const secret = generateWords(wordCount)
    initReceiverFlow(secret)
  })

  onDestroy(() => {
    cleanupRoom()
    resetStreams()
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
    onShare={handleShareClick}
  />
{:else}
  <SenderView
    secret={roomSecret}
    wordlist={wordlist}
    wordCount={wordCount}
    status={status}
    error={error}
    mode={role}
    onStart={handleManualStart}
    onScan={handleScan}
  />
{/if}
