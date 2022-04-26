<script>
  import { replace } from 'svelte-spa-router'
  import { debug } from 'svelte/internal';
  async function status() {
    const response = await fetch('/api/status')
    const status = await response.json()
    console.log(status)
    return status
  }

  const hashPosition = window.location.href.indexOf('#/')
  if (hashPosition < 0) {
    const url = new URL(window.location.href)
    window.history.pushState({}, '', url.origin + '/#/')
  }

</script>

<h2 class="routetitle">Home!</h2>

<p>This is really Home</p>

{#await status() then value}
  <p>the value is {JSON.stringify(value, null, 2)}</p>
{/await}
