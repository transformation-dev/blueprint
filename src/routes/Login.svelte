<script>
  import Debug from "debug"
  const debug = Debug("blueprint:Login")

  import Icon from 'svelte-awesome'
  import {envelope, key} from 'svelte-awesome/icons'
  import {onMount} from 'svelte'
  import { Button, Input, Toast, Toasts } from 'agnostic-svelte'

  import {RealtimeStore} from '@transformation-dev/svelte-realtime-store'

  import { authenticated } from '../stores'

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
    showToast(parsed)
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
    const parsed = await response.json()
    debug('In sendCode after calling /api/send-code. response: %O', parsed)
    showToast(parsed)
  }

  async function verifyCode(event) {
    debug('sendCode() called')
    window.history.pushState({}, '', `/api/passwordless-login/verify-code/${code}`)
  }

  let email = ''  // TODO: get this from localStorage (and store it there in handleLogin)
  let code = ''

  let toastEnabled = false
  let toastMessage = ''
  let toastMessageType = 'error'
  function showToast({ message, messageType }) {
    toastMessage = message
    toastMessageType = messageType
    toastEnabled = true
    setTimeout(() => {
      toastEnabled = false
    }, 3000)
  }
  
</script>

<div class="flex justify-center">
  <form class="p16">
    <Input isRounded label="Email" placeholder="email@example.com" bind:value={email}/>
    <div class="mbe16" />
    <Button type="submit" mode="primary" isRounded on:click={sendCode}>
      Send Code to Email
    </Button>
    <div class="mbe40" />
    <Input isRounded label="Code" placeholder="123456" required bind:value={code}/>
    <div class="mbe16" />
    <Button type="submit" mode="action" isRounded on:click={verifyCode}>
      Verify Code
    </Button>
    <div class="mbe16" />
  </form>
</div>

<Toasts portalRootSelector="body" horizontalPosition="center" verticalPosition="top">
  <Toast isOpen={toastEnabled} type={toastMessageType}>
    <p>{toastMessage}</p>
  </Toast>
</Toasts>
