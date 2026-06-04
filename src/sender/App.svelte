<script>
  import { onMount, onDestroy } from 'svelte';
  import autocomplete from 'autocompleter';
  import { Html5Qrcode } from 'html5-qrcode';
  import { wordlist } from '@scure/bip39/wordlists/english.js';
  import ScreenShare from './components/ScreenShare.svelte';

  let rawInputValue = $state('');
  let isStreamingActive = $state(false);
  let inputElement = $state(null);
  let errorMessage = $state('');

  let scannerActive = $state(false);
  let qrScanner = null;
  const scannerId = 'qr-reader';

  let lastPrefix = '';
  let lastSuggestions = [];

  function normalizeWords(value) {
    return value.toLowerCase().replace(/-+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function getCurrentWord(value) {
    const normalized = normalizeWords(value);
    if (!normalized) return '';
    const parts = normalized.split(' ');
    return parts[parts.length - 1] || '';
  }

  function applySuggestion(wordValue) {
    const current = normalizeWords(inputElement?.value || '');
    const parts = current ? current.split(' ') : [];
    if (parts.length === 0) {
      rawInputValue = wordValue + ' ';
      return;
    }
    parts[parts.length - 1] = wordValue;
    rawInputValue = parts.join(' ') + ' ';
  }

  function handleKeydown(event) {
    if (event.key !== ' ') return;
    const activeId = event.currentTarget.getAttribute('aria-activedescendant');
    let suggestion = '';

    if (activeId) {
      const activeEl = document.getElementById(activeId);
      suggestion = activeEl?.textContent?.trim() || '';
    }
    if (!suggestion) {
      const current = getCurrentWord(event.currentTarget.value);
      if (!current || current !== lastPrefix) return;
      suggestion = lastSuggestions.find(word => word.startsWith(current) && word !== current) || '';
    }
    if (!suggestion) return;
    event.preventDefault();
    applySuggestion(suggestion);
  }

  async function stopScanner() {
    if (!qrScanner) return;
    try {
      await qrScanner.stop();
      qrScanner.clear();
    } catch (err) {
      console.error('Unable to stop scanner:', err);
    }
    qrScanner = null;
    scannerActive = false;
  }

  async function startScanner() {
    errorMessage = '';
    if (scannerActive) return;
    qrScanner = new Html5Qrcode(scannerId);
    scannerActive = true;
    try {
      await qrScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        async (decodedText) => {
          try {
            const url = new URL(decodedText);
            const param = url.searchParams.get('room');
            if (param) {
              rawInputValue = param.replace(/-+/g, ' ').trim().toLowerCase() + ' ';
              await stopScanner();
            }
          } catch {
            if (decodedText.includes('-') || decodedText.includes(' ')) {
              rawInputValue = decodedText.replace(/-+/g, ' ').trim().toLowerCase() + ' ';
              await stopScanner();
            } else {
              errorMessage = 'No valid room information found in QR code.';
            }
          }
        },
        () => {}
      );
    } catch (err) {
      errorMessage = 'Unable to start camera access.';
      scannerActive = false;
      qrScanner = null;
    }
  }

  onMount(() => {
    if (!inputElement) return;

    autocomplete({
      input: inputElement,
      minLength: 1,
      fetch: (text, update) => {
        const normalized = normalizeWords(text);
        const parts = normalized.split(' ');
        const current = parts[parts.length - 1] || '';

        if (!current) {
          lastPrefix = '';
          lastSuggestions = [];
          update([]);
          return;
        }

        const suggestions = wordlist.filter(word => word.startsWith(current)).slice(0, 20);
        lastPrefix = current;
        lastSuggestions = suggestions;
        update(suggestions.map(word => ({ label: word, value: word })));
      },
      onSelect: (item, input) => {
        rawInputValue = input.value;
        applySuggestion(item.value);
      }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      rawInputValue = roomParam.replace(/-+/g, ' ').trim().toLowerCase() + ' ';
    }
  });

  onDestroy(() => {
    stopScanner();
  });

  const cleanedSecret = $derived(rawInputValue.trim().toLowerCase().replace(/[\s-]+/g, ' '));
  const splitWords = $derived(cleanedSecret.split(' ').filter(Boolean));
  const isFormValid = $derived(splitWords.length === 4 && splitWords.every(word => wordlist.includes(word)));

  function triggerStreamingFlow() {
    if (isFormValid) isStreamingActive = true;
  }
</script>

{#if isStreamingActive}
  <ScreenShare bip39String={cleanedSecret} />
{:else}
  <div class="sender">
    <div class="sender-header">
      <h1>Share your screen</h1>
      <p>Enter the 4 words or scan the TV QR code to start transmission.</p>
    </div>

    <div class="button-row">
      <button class="primary" type="button" disabled={!isFormValid} onclick={triggerStreamingFlow}>
        Start sharing
      </button>
      <button class="secondary" type="button" onclick={startScanner} disabled={scannerActive}>
        {scannerActive ? 'Scanner running...' : 'Scan QR'}
      </button>
      {#if scannerActive}
        <button class="secondary" type="button" onclick={stopScanner}>Stop scanner</button>
      {/if}
    </div>

    <div style="width: 100%; margin-top: 8px;">
      <input
        id="room-input"
        class="room-input"
        type="text"
        placeholder="word1 word2 word3 word4"
        bind:this={inputElement}
        bind:value={rawInputValue}
        onkeydown={handleKeydown}
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    {#if errorMessage}
      <div class="error">{errorMessage}</div>
    {/if}

    <div class="scanner" class:scanner-active={scannerActive}>
      <div id={scannerId} class="scanner-surface"></div>
    </div>
  </div>
{/if}