<script>
  import { createEventDispatcher } from 'svelte'

  export let qrCodeUrl = ''
  export let secret = ''
  export let shareUrl = ''
  export let status = ''

  const dispatch = createEventDispatcher()
  $: words = secret ? secret.split(' ') : []
</script>

<div class="receiver">
  <div class="qr">
    {#if qrCodeUrl}
      <img src={qrCodeUrl} alt="QR code for pairing" />
    {:else}
      <div class="qr-placeholder">Generating QR…</div>
    {/if}
  </div>

  <div class="secret" aria-label="Pairing words">
    {#each words as word}
      <span>{word}</span>
    {/each}
  </div>

  {#if shareUrl}
    <div class="share-url">{shareUrl}</div>
  {/if}

  {#if status}
    <div class="status">{status}</div>
  {/if}

  <button class="share-button" type="button" on:click={() => dispatch('share')}>
    I want to share
  </button>
</div>
