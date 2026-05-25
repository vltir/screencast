<script>
  import { afterUpdate, onMount } from 'svelte'

  export let stream = null
  let videoEl

  const attachStream = () => {
    if (videoEl && stream && videoEl.srcObject !== stream) {
      videoEl.srcObject = stream
    }
  }

  onMount(attachStream)
  afterUpdate(attachStream)
</script>

<video
  class="video-fullscreen"
  bind:this={videoEl}
  autoplay
  playsinline
  muted
></video>
