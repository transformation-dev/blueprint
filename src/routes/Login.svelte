<script>
  import Debug from "debug"
  const debug = Debug("blueprint:Login")

  import Icon from 'svelte-awesome'
  import envelope from 'svelte-awesome/icons/envelope'
  import key from 'svelte-awesome/icons/key'

  import { onMount } from 'svelte'
  import Button from 'agnostic-svelte/components/Button/Button.svelte'
  import Input from 'agnostic-svelte/components/Input/Input.svelte'

  import { RealtimeStore } from '@transformation-dev/svelte-realtime-store'

  import { authenticated, addToast } from '../stores'

  // It may seem counterintiuitive to have checkAuthentication in this Login component
  // now that the user doesn't enter a password, but the router will mount this component if
  // the user navigates to a page that requires authentication.
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
    console.log(parsed)
    addToast(parsed)
  }

  // onMount(checkAuthentication)

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
    const parsed = await response.json()
    debug('In sendCode after calling /api/send-code. response: %O', parsed)
    addToast(parsed)
  }

  async function verifyCode(event) {
    debug('verifyCode() called')

    const response = await fetch('/api/passwordless-login/verify-code', {
      method: 'POST', 
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin', 
      body: JSON.stringify({ code, targetURL: window.location.href })
    })

    const parsed = await response.json()
    if (parsed.success) {
      addToast({ message: 'Login successful', messageType: 'success' })
    } else {
      addToast({ message: 'Invalid code', messageType: 'warning' })
    }
    $authenticated = parsed.success
    // await checkAuthentication()
  }

  let email = ''  // TODO: get this from localStorage (and store it there in handleLogin)
  let code = ''

</script>

<style>
  .icon {
    color: var(--blueprint-culture);
  }
</style>

<div class="flex justify-center">
  <form class="p16">
    <Input id="email" isRounded label="Email" placeholder="email@example.com" bind:value={email} />
    <div class="mbe16" />
    <Button id="send-code" mode="primary" isRounded on:click={sendCode}>
      <Icon class="mie8" data={envelope} />
      Send Code to Email
    </Button>
    <div class="mbe40" />
    <Input id="code" isRounded label="Code" placeholder="123456" bind:value={code}/>
    <div class="mbe16" />
    <Button id="verify-code" mode="action" isRounded on:click={verifyCode}>
      <Icon class="mie8" data={key} />
      Verify Code
    </Button>
    <div class="mbe16" />
  </form>
</div>
