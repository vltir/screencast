<script>
  import { onMount } from 'svelte';
  import autocomplete from 'autocompleter';
  import { wordlist } from '@scure/bip39/wordlists/english.js';
  import ScreenShare from './components/ScreenShare.svelte';

  let rawInputValue = $state('');
  let isStreamingActive = $state(false);
  let inputElement = $state(null);

  onMount(() => {
    if (!inputElement) return;

    // Wire up the autocomplete handler directly via native autocompleter library matching repository spec
    autocomplete({
      input: inputElement,
      minLength: 1,
      fetch: (text, update) => {
        const parts = text.toLowerCase().split(/[\s-]+/);
        const currentWord = parts[parts.length - 1] || '';
        if (!currentWord) return update([]);

        const suggestions = wordlist
          .filter(word => word.startsWith(currentWord))
          .slice(0, 5)
          .map(word => ({ label: word, value: word }));
        update(suggestions);
      },
      onSelect: (item) => {
        const parts = rawInputValue.toLowerCase().split(/[\s-]+/);
        parts[parts.length - 1] = item.value;
        rawInputValue = parts.join(' ') + ' ';
        inputElement.focus();
      }
    });

    // Handle automated entry if scanned via QR link parameter
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      rawInputValue = roomParam.replace(/-+/g, ' ').trim().toLowerCase();
      if (isFormValid) {
        isStreamingActive = true;
      }
    }
  });

  // Reactive state derivation for clean validation logic
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
    <h1>Share your screen</h1>
    <p>Enter the 4 words displayed on your TV screen to start the encrypted peer-to-peer transmission.</p>

    <div style="width: 100%; margin-top: 8px;">
      <label style="display:block; font-size:13px; color:var(--muted); margin-bottom:8px;" for="room-input">Room words</label>
      <input
        id="room-input"
        class="room-input"
        type="text"
        placeholder="e.g. apple banana cherry dog"
        bind:this={inputElement}
        bind:value={rawInputValue}
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <button class="primary" type="button" disabled={!isFormValid} onclick={triggerStreamingFlow}>
      Start sharing
    </button>
  </div>
{/if}