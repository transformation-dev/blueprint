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
  import 'agnostic-svelte/css/common.min.css'
  import { Button } from 'agnostic-svelte'

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

  import { routes, activeComponent } from './router'
  import { authenticated } from './stores'

  // const teamID = new ViewstateStore({
  //   identifier: 'teamID',
  //   defaultValue: 'team1',
  //   scope: '/'
  // })


  // if (location.pathname === '/') {
  //   replace('/#/')
  // }

  async function handleLogout(event) {
    const response = await fetch('/api/logout', { 
      headers: {
        'Accept': 'application/json',
      },
      credentials: 'same-origin',
    })
    const parsed = await response.json()
    debug('Got response from /logout: %O', parsed)
    $authenticated = parsed.authenticated
  }
</script>

<style>
  :root {
    --agnostic-primary: #077acb;
    --agnostic-primary-hover: #659ac1;
    --agnostic-primary-light: #dcf1ff;
    --agnostic-primary-border: #c1d9e9;
    --agnostic-primary-dark: #063f69;
    --agnostic-secondary: #49826A;
    --agnostic-secondary-hover: #80AB9B;
    --agnostic-action: #2fb751;
    --agnostic-action-light: #e2ffe9;
    --agnostic-action-border: #c7f0d1;
    --agnostic-action-hover: #3dd262;
    --agnostic-warning-light: #fff5d4;
    --agnostic-warning-border-accent: #ecd386;
    --agnostic-warning-border: #f0e3b9;
    --agnostic-warning-dark: #634902;
    --agnostic-error: #e02e2e;
    --agnostic-error-dark: #771414;
    --agnostic-error-light: #ffe0e0;
    --agnostic-error-border: #eec8c8;
    --agnostic-gray-extra-light: #f8f8f8;
    --agnostic-gray-light: #e9e9e9;
    --agnostic-gray-mid: #d8d8d8;
    --agnostic-gray-mid-dark: #ccc;
    --agnostic-gray-dark: #757575;
    --agnostic-dark: #333;
    --agnostic-light: #fff;
    --agnostic-disabled-bg: var(--agnostic-gray-light);
    --agnostic-disabled-color: var(--agnostic-gray-dark);

    --blueprint-culture: #49826A;
    --blueprint-actions: #80AB9B;
    --blueprint-words: #BFD5CC;
    --blueprint-thoughts: #FFFFFF;
    --blueprint-unknown: #A8C4D8;
    --blueprint-tradeoff: #CCCCCC;
  }

  .navbar {
    overflow: hidden;
    background-color: var(--agnostic-dark);
    position: fixed; /* Set the navbar to fixed position */
    top: 0; /* Position the navbar at the top of the page */
    width: 100%; /* Full width */
    display: flex;
    justify-content: space-between;
  }

  .thin-divider {
    background-color: var(--blueprint-culture);
    height: 5px;
  }

  .logo {
    max-height: 24px;
  }

  .is-active {
    color: var(--agnostic-primary-light);
  }

  a {
    color: var(--agnostic-primary);
    text-decoration: none;
  }

  a:hover { 
    color: var(--agnostic-primary-hover);
  }
</style>

<svelte:head>
  <title>Transformation Blueprint {$location}</title>
  <!-- <link rel="icon" type="image/png" href="favicon.png"> -->  <!-- moved to index.html -->
</svelte:head>

<!-- Need to stop using the class has-navbar-fixed-top in line below -->
<Body class="has-navbar-fixed-top" />

<div class="navbar flex flex-column">
  <div class="thin-divider"></div>
  <div class="flex flex-row justify-between">
    <div class="flex items-center">
      <a href="/#/">
        <img class="mbs8 mis8 logo" src={logo} alt="Transformation.dev Blueprint Logo">
      </a>
      {#each [...routes] as [route, value]}
        {#if value.navbarLabel}
          <a class="mis16" use:routerLink class:is-active={$location === route} href={route}>
            {value.navbarLabel}
          </a>
        {/if}
      {/each}
    </div>
    <Button id="logout" mode="primary" on:click={handleLogout}>
      <Icon data={signOut}/>
    </Button>
  </div>
</div>

<svelte:component this={$activeComponent} />
