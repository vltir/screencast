<script>
  import { onDestroy, onMount } from 'svelte'
  import autocompleter from 'autocompleter'
  import { Html5Qrcode } from 'html5-qrcode'

  /** @type {string} */
  export let secret = ''
  /** @type {string[]} */
  export let wordlist = []
  /** @type {number} */
  export let wordCount = 4
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
  /** @type {HTMLInputElement | null} */
  let inputEl = null
  /** @type {string} */
  let placeholder = ''
  /** @type {string} */
  let lastPrefix = ''
  /** @type {string[]} */
  let lastSuggestions = []
  /** @type {boolean} */
  let scannerActive = false
  /** @type {string} */
  let scannerError = ''
  /** @type {Html5Qrcode | null} */
  let qrScanner = null

  /** @param {string} value */
  const normalizeWords = (value) =>
    value
      .toLowerCase()
      .replace(/-+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  /** @param {string} value */
  const setInputValue = (value) => {
    inputValue = value
    if (inputEl) {
      inputEl.value = value
    }
  }

  $: if (mode === 'sender-auto' && secret) setInputValue(normalizeWords(secret))
  $: placeholder = Array.from({ length: wordCount }, (_, index) => `word${index + 1}`).join(' ')

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
    onStart?.(normalizeWords(inputValue))
  }

  /** @param {InputEvent & { currentTarget: HTMLInputElement }} event */
  const updateInput = (event) => {
    inputValue = event.currentTarget.value
  }

  /** @param {string} value */
  const getCurrentWord = (value) => {
    const normalized = normalizeWords(value)
    if (!normalized) return ''
    const parts = normalized.split(' ')
    return parts[parts.length - 1] ?? ''
  }

  /** @param {string} value */
  const applySuggestion = (value) => {
    const current = normalizeWords(inputEl?.value ?? '')
    const parts = current ? current.split(' ') : []
    if (parts.length === 0) {
      setInputValue(`${value} `)
      return
    }
    parts[parts.length - 1] = value
    setInputValue(`${parts.join(' ')} `)
  }

  /** @param {KeyboardEvent & { currentTarget: HTMLInputElement }} event */
  const handleKeydown = (event) => {
    if (event.key !== ' ') return
    const activeId = event.currentTarget.getAttribute('aria-activedescendant')
    let suggestion = ''
    if (activeId) {
      const activeEl = document.getElementById(activeId)
      suggestion = activeEl?.textContent?.trim() ?? ''
    }
    if (!suggestion) {
      const current = getCurrentWord(event.currentTarget.value)
      if (!current || current !== lastPrefix) return
      suggestion = lastSuggestions.find((word) => word.startsWith(current) && word !== current) ?? ''
    }
    if (!suggestion) return
    event.preventDefault()
    applySuggestion(suggestion)
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
            setInputValue(normalizeWords(parsed))
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


  onMount(() => {
    if (!inputEl) return
    const instance = autocompleter({
      input: inputEl,
      minLength: 1,
      fetch: (text, update, _trigger, _cursorPos) => {
        const normalized = normalizeWords(text)
        const parts = normalized.split(' ')
        const current = parts[parts.length - 1] ?? ''
        if (!current) {
          lastPrefix = ''
          lastSuggestions = []
          update([])
          return
        }
        const suggestions = wordlist.filter((word) => word.startsWith(current)).slice(0, 20)
        lastPrefix = current
        lastSuggestions = suggestions
        update(suggestions.map((word) => ({ label: word, value: word })))
      },
      onSelect: (item, input) => {
        inputValue = input.value
        applySuggestion(item.value)
      },
    })

    return () => {
      instance?.destroy?.()
    }
  })

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
      <p>Enter the {wordCount} words or scan the TV QR code.</p>
    {/if}
  </div>

  <label class="input-label" for="room-input">Room words</label>
  <input
    id="room-input"
    class="room-input"
    type="text"
    placeholder={placeholder}
    bind:this={inputEl}
    value={inputValue}
    on:input={updateInput}
    on:keydown={handleKeydown}
    autocomplete="off"
    spellcheck="false"
  />

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
