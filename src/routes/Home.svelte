<script>
  async function status() {
    const response = await fetch('/api/status')
    const status = await response.json()
    console.log(status)
    return status
  }
</script>

<h2 class="routetitle">Home!</h2>

<p>This is really Home</p>

{#await status() then value}
  <p>the value is {JSON.stringify(value, null, 2)}</p>
{/await}
