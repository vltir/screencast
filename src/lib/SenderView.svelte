<script>
  import { onDestroy } from 'svelte'
  import { Html5Qrcode } from 'html5-qrcode'

  /** @type {string} */
  export let secret = ''
  /** @type {string[]} */
  export let wordlist = []
  /** @type {string} */
  export let status = ''
  /** @type {string} */
  export let error = ''
  /** @type {'sender-auto' | 'sender-manual' | 'connected'} */
  export let mode = 'sender-manual'
  /** @type {(secret: string) => void} */
  export let onStart = () => {}
  /** @type {(secret: string) => void} */
  export let onScan = () => {}

  const scannerId = 'qr-reader'

  /** @type {string} */
  let inputValue = ''
  /** @type {boolean} */
  let scannerActive = false
  /** @type {string} */
  let scannerError = ''
  /** @type {Html5Qrcode | null} */
  let qrScanner = null

  $: if (mode === 'sender-auto' && secret && secret !== inputValue) inputValue = secret

  /** @param {string} text */
  const parseRoomFromText = (text) => {
    try {
      const url = new URL(text)
      const param = url.searchParams.get('room')
      if (param) {
        return param.replace(/-+/g, ' ').trim()
      }
    } catch {
      // Not a URL, fall through.
    }
    if (text.includes('-') || text.includes(' ')) {
      return text.replace(/-+/g, ' ').trim()
    }
    return ''
  }

  /** @param {unknown} err */
  const getErrorMessage = (err) => {
    if (err && typeof err === 'object' && 'message' in err) {
      const message = err.message
      if (typeof message === 'string') return message
    }
    if (typeof err === 'string') return err
    return ''
  }

  const startSharing = () => {
    onStart?.(inputValue)
  }

  const stopScanner = async () => {
    if (!qrScanner) return
    try {
      await qrScanner.stop()
      qrScanner.clear()
    } catch (err) {
      scannerError = getErrorMessage(err) || 'Unable to stop scanner.'
    }
    qrScanner = null
    scannerActive = false
  }

  const startScanner = async () => {
    scannerError = ''
    if (scannerActive) return
    qrScanner = new Html5Qrcode(scannerId)
    scannerActive = true
    try {
      await qrScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        async (/** @type {string} */ decodedText) => {
          const parsed = parseRoomFromText(decodedText)
          await stopScanner()
          if (parsed) {
            inputValue = parsed
            onScan?.(parsed)
          } else {
            scannerError = 'No room information found in the QR code.'
          }
        },
        () => {}
      )
    } catch (err) {
      scannerError = getErrorMessage(err) || 'Unable to start the camera.'
      scannerActive = false
      qrScanner = null
    }
  }


  onDestroy(() => {
    stopScanner()
  })
</script>

<div class="sender">
  <div class="sender-header">
    <h1>Share your screen</h1>
    {#if mode === 'sender-auto'}
      <p>Starting screen share from the QR link…</p>
    {:else}
      <p>Enter the 12 words or scan the TV QR code.</p>
    {/if}
  </div>

  <label class="input-label" for="room-input">Room words</label>
  <input
    id="room-input"
    class="room-input"
    type="text"
    list="bip39-words"
    placeholder="word1 word2 word3 …"
    bind:value={inputValue}
    autocomplete="off"
    spellcheck="false"
  />

  <datalist id="bip39-words">
    {#each wordlist as word}
      <option value={word}></option>
    {/each}
  </datalist>

  <div class="button-row">
    <button class="primary" type="button" on:click={startSharing}>Start sharing</button>
    <button class="secondary" type="button" on:click={startScanner} disabled={scannerActive}>
      {scannerActive ? 'Scanner running…' : 'Scan QR'}
    </button>
    {#if scannerActive}
      <button class="secondary" type="button" on:click={stopScanner}>Stop scanner</button>
    {/if}
  </div>

  {#if status}
    <div class="status">{status}</div>
  {/if}
  {#if error}
    <div class="error">{error}</div>
  {/if}
  {#if scannerError}
    <div class="error">{scannerError}</div>
  {/if}

  <div class:scanner-active={scannerActive} class="scanner">
    <div id={scannerId} class="scanner-surface"></div>
  </div>
</div>
