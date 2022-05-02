<script>
  import Debug from "debug"
  const debug = Debug("blueprint:Login")

  import Icon from 'svelte-awesome'
  import {envelope, key} from 'svelte-awesome/icons'
  import {onMount} from 'svelte'

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
    if (parsed.authenticated) {
      $authenticated = true
      // RealtimeStore.restoreConnection((connected) => {
      //   debug('Callback from restoreConnection. connected: %O', connected)
      // })
    }
  }

  onMount(checkAuthentication)

  async function handleLogin(event) {
    debug('handleLogin() called')
    const response = await fetch('/api/passwordless-login/send-code', {
      method: 'POST', 
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin', 
      body: JSON.stringify({ email, targetURL: window.location.href })
    })
    debug('In handleLogin after login attempt. response: %O', response)
    // if (response.ok) {
    //   await checkAuthentication()
    // }
  }

  let email = ''  // TODO: get this from localStorage (and store it there in handleLogin)
  
</script>

<!-- I have no idea what the below code does -->
<div class="tile is-ancestor">
  <div class="tile is-parent">
    <div class="tile is-child is-12"></div>
  </div>
</div>

<!-- I also don't understand what the first two layers of <div> tags do -->
<div class="tile is-ancestor">
  <div class="tile is-parent">
    <div class="tile is-child"></div>  <!-- If you remove this it doesn't center. Why? -->
    <div class="tile is-5 is-child has-text-centered box">
      <p class="title has-text-centered">Login</p>
      <div class="field">
        <p class="control has-icons-left">
          <input class="input" type="email" placeholder="Email" bind:value={email}>
          <span class="icon is-small is-left">
            <Icon data={envelope}/>
          </span>
        </p>
      </div>
      <!-- Restore the section below when we want to allow the user to manually input the code -->
      <!-- <div class="field">
        <p class="control has-icons-left">
          <input class="input" type="password" placeholder="Code">
          <span class="icon is-small is-left">
            <Icon data={key}/>
          </span>
        </p>
      </div> -->
      <button class="button is-success is-centered" id="login" on:click={handleLogin}>Send Login Code to Email</button>
    </div>
    <div class="tile is-child"></div>
  </div>
</div>

