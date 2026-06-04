<script>
  import autocomplete from 'autocompleter';
  import { bip39Words } from '../../shared/bip39-words';

  let { onWordsConfirmed } = $props();
  let wordSlots = $state(['', '', '', '']);

  function setupAutocomplete(node, index) {
    const instance = autocomplete({
      input: node,
      minLength: 1,
      fetch: (text, update) => {
        const query = text.toLowerCase();
        const suggestions = bip39Words
          .filter(word => word.startsWith(query))
          .map(word => ({ label: word, value: word }));
        update(suggestions.slice(0, 5));
      },
      onSelect: (item) => {
        wordSlots[index] = item.value;
      }
    });

    return {
      destroy() {
        instance.destroy();
      }
    };
  }

  const isFormValid = $derived(wordSlots.every(word => bip39Words.includes(word.trim().toLowerCase())));

  function handleSubmit() {
    if (isFormValid) {
      onWordsConfirmed(wordSlots.join(' ').toLowerCase());
    }
  }
</script>

<h2>Enter TV Room Words</h2>
<p>Type the 4 words displayed on your TV screen.</p>

<div class="input-grid">
  {#each wordSlots as _, index}
    <input
      type="text"
      placeholder="Word {index + 1}"
      bind:value={wordSlots[index]}
      use:setupAutocomplete={index}
    />
  {/each}
</div>

<button disabled={!isFormValid} onclick={handleSubmit}>
  Connect & Start Share
</button>

<style>
  h2 { margin-bottom: 5px; }
  p { color: #aaa; margin-bottom: 25px; font-size: 14px; }
  .input-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; }
  input { padding: 12px; background: #2b2b2b; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 16px; text-align: center; text-transform: uppercase; }
  input:focus { border-color: #0078d4; outline: none; }
  button { padding: 12px 24px; background: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; }
  button:disabled { background: #333; color: #666; cursor: not-allowed; }
  button:not(:disabled):hover { background: #005a9e; }
</style>