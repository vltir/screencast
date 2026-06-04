<script>
  let { onShareSelect } = $props();
</script>

<h1>WebRTC Screen Share Sender</h1>
<p>Stream your desktop directly to your television securely and serverless.</p>

<button onclick={onShareSelect}>I want to share</button>

<style>
  h1 { font-size: 28px; margin-bottom: 10px; }
  p { color: #aaa; margin-bottom: 30px; }
  button { padding: 14px 28px; background: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 18px; font-weight: bold; }
  button:hover { background: #005a9e; }
</style>