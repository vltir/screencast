<script>
  import { onMount } from 'svelte';
  import autocomplete from 'autocompleter';
  import { wordlist } from '@scure/bip39/wordlists/english.js';
  import ScreenShare from './components/ScreenShare.svelte';

  let rawInputValue = $state('');
  let isStreamingActive = $state(false);
  let inputElement = $state(null);

  let lastPrefix = '';
  let lastSuggestions = [];

  function normalizeWords(value) {
    return value
      .toLowerCase()
      .replace(/-+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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

    // Extract query parameter and fill the input structure without locking the interaction flow
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      rawInputValue = roomParam.replace(/-+/g, ' ').trim().toLowerCase() + ' ';
    }
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
    <h1>Share your screen</h1>
    <p>Enter the 4 words displayed on your TV screen to start the encrypted peer-to-peer transmission.</p>

    <div style="width: 100%; margin-top: 8px;">
      <label style="display:block; font-size:13px; color:var(--muted); margin-bottom:8px;" for="room-input">Room words</label>
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

    <button class="primary" type="button" disabled={!isFormValid} onclick={triggerStreamingFlow}>
      Start sharing
    </button>
  </div>
{/if}