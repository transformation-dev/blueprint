<!-- <script>
  import './index.scss'
  import logo from './assets/svelte.png'
  import Counter from './lib/Counter.svelte'
</script>

<main>
  <img src={logo} alt="Svelte Logo" />
  <h1>Hello World!</h1>

  <Counter />

  <p>
    Visit <a href="https://svelte.dev">svelte.dev</a> to learn how to build Svelte
    apps.
  </p>

  <p>
    Check out <a href="https://github.com/sveltejs/kit#readme">SvelteKit</a> for
    the officially supported framework, also powered by Vite!
  </p>
</main> -->

<script>
  import './index.scss'

  import Debug from "debug"
  const debug = Debug("blueprint:App")  // Don't forget to set environment variable with 'DEBUG=blueprint:*' and localStorage with debug='blueprint:*'

  import { Body } from 'svelte-body'

  import logo from './assets/transformation-blueprint-logo.png'

  // const {NODE_ENV} = process.env
  // if (NODE_ENV !== 'production') {
  //   // require('whatwg-fetch')
  // }

  import {link as routerLink, location} from 'svelte-spa-router'  // TODO: Move these to svelte-viewstate-store 
  import Icon from 'svelte-awesome'
  import {signOut} from 'svelte-awesome/icons'

  // import {ViewstateStore} from '@transformation-dev/svelte-viewstate-store'

  import {routes, activeComponent} from './router'
  // import {authenticated} from './stores'

  // const teamID = new ViewstateStore({
  //   identifier: 'teamID',
  //   defaultValue: 'team1',
  //   scope: '/'
  // })


  // if (location.pathname === '/') {
  //   replace('/#/')
  // }

  async function handleLogout(event) {
    // $authenticated = false
    // const response = await fetch('/logout', { 
    //   headers: {
    //     'Accept': 'application/json',
    //   },
    //   credentials: 'same-origin', 
    // })
    // const parsed = await response.json()
    // debug('Got response from /logout: %O', parsed)
    // $authenticated = parsed.authenticated
  }
</script>

<svelte:head>
  <title>Transformation Blueprint{$location}</title>
  <!-- <link rel="icon" type="image/png" href="favicon.png"> -->  <!-- moved to index.html -->
</svelte:head>

<nav class="navbar is-fixed-top">
  <div class="navbar-brand">
    <a class="navbar-item" href="/#/">
      <img src={logo} alt="Transformation.dev Blueprint Logo">
    </a>
  </div>
  <div class="navbar-menu">
    <div class="navbar-start">
      {#each [...routes] as [route, value]}
        {#if value.navbarLabel}
          <a class="navbar-item" use:routerLink class:is-active={$location === route} href={route}>
            {value.navbarLabel}
          </a>
        {/if}
      {/each}
    </div>
    <div class="navbar-end">
      <div class="navbar-item">
        <div class="field is-grouped">
          <p class="control">
            <button id="logout" on:click={handleLogout} class="button is-rounded is-small"> 
              <Icon data={signOut}/>
              Logout
            </button>
          </p>
        </div>
      </div>
    </div>
  </div>
</nav>

<Body class="has-navbar-fixed-top" />

<svelte:component this={$activeComponent} />
