<script>
  import Debug from "debug"
  const debug = Debug("blueprint:Login")

  import Icon from 'svelte-awesome'
  import {envelope, key} from 'svelte-awesome/icons'
  import {onMount} from 'svelte'
  import { Button, Input, Card } from 'agnostic-svelte'

  import {RealtimeStore} from '@transformation-dev/svelte-realtime-store'

  import { authenticated } from '../stores'

  async function checkAuthentication() {
    debug('checkAuthentication() called')
    const response = await fetch('/api/check-authentication', { 
      headers: {
        'Accept': 'application/json'
      },
      credentials: 'same-origin', 
    })
    const parsed = await response.json()
    debug('Got response from /api/check-authentication: %O', parsed)
    $authenticated = parsed.authenticated
  }

  onMount(checkAuthentication)

  async function sendCode(event) {
    debug('sendCode() called')
    const response = await fetch('/api/passwordless-login/send-code', {
      method: 'POST', 
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin', 
      body: JSON.stringify({ email, targetURL: window.location.href })
    })
    debug('In sendCode after calling /api/send-code. response: %O', response)
    // if (response.ok) {
    //   await checkAuthentication()
    // }
  }

  let email = ''  // TODO: get this from localStorage (and store it there in handleLogin)
  
</script>

<!-- <style>
  form {
    box-shadow: 5px 10px #888888;
  }
</style> -->

<div class="flex justify-center">
  <form class="p16">
    <Input isRounded label="Email (required)" placeholder="email@example.com" required bind:value={email}/>
    <div class="mbe16" />
    <Button type="submit" mode="primary" isRounded on:click={sendCode}>
      Send Login Code to Email
    </Button>
    <div class="mbe16" />
  </form>
</div>
