<script>
  /** @type {{ stream: MediaStream | null }} */
  let { stream } = $props()
  /** @type {HTMLVideoElement | null} */
  let videoEl = null

  $effect(() => {
    if (!videoEl) return
    if (stream && videoEl.srcObject !== stream) {
      videoEl.srcObject = stream
    }
    if (!stream && videoEl.srcObject) {
      videoEl.srcObject = null
    }
  })
</script>

<video
  class="video-fullscreen"
  bind:this={videoEl}
  autoplay
  playsinline
  muted
></video>
