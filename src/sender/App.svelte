<script>
  import MainMenu from './components/MainMenu.svelte';
  import WordInput from './components/WordInput.svelte';
  import ScreenShare from './components/ScreenShare.svelte';

  let currentScreen = $state('MENU');
  let bip39RoomString = $state('');

  $effect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');

    if (roomFromUrl) {
      bip39RoomString = decodeURIComponent(roomFromUrl).trim().toLowerCase();
      currentScreen = 'SHARING';
    }
  });
</script>

<main class="container">
  {#if currentScreen === 'MENU'}
    <MainMenu onShareSelect={() => currentScreen = 'INPUT'} />
  {:else}
    <div class="room-info">
      ROOM: <span>{bip39RoomString.toUpperCase()}</span>
    </div>
  {/if}

  {#if currentScreen === 'INPUT'}
    <WordInput
      onWordsConfirmed={(confirmedString) => {
        bip39RoomString = confirmedString;
        currentScreen = 'SHARING';
      }}
    />
  {/if}

  {#if currentScreen === 'SHARING'}
    <ScreenShare bip39String={bip39RoomString} />
  {/if}
</main>

<style>
  .container { max-width: 600px; margin: 40px auto; padding: 20px; background: #1a1a1a; border-radius: 8px; border: 1px solid #333; text-align: center; }
  .room-info { font-size: 18px; font-weight: bold; margin-bottom: 20px; color: #aaa; }
  .room-info span { color: #0078d4; letter-spacing: 1px; }
</style>