
<script>
  // import { parseBody } from '../utils'
  import { requestOutResponseIn } from '@transformation-dev/cloudflare-do-utils'

  async function status() {
    // const response = await fetch('/api/status')
    // const status = await parseBody(response)
    const response = await requestOutResponseIn('/api/status')
    return response.content
    // return status
  }

  const hashPosition = window.location.href.indexOf('#/')
  if (hashPosition < 0) {
    const url = new URL(window.location.href)
    window.history.replaceState(null, '', url.origin + '/#/')
  }

</script>


<h2 class="routetitle">Home!</h2>

<p>This is the final Home</p>

{#await status() then value}
  <p>the value is {JSON.stringify(value, null, 2)}</p>
{/await}
