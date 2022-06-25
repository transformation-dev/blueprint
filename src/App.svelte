
<script>
  // import './index.scss'
  import 'agnostic-svelte/css/common.min.css'
  import Header from 'agnostic-svelte/components/Header/Header.svelte'
  import HeaderNav from 'agnostic-svelte/components/Header/HeaderNav.svelte'
  import HeaderNavItem from 'agnostic-svelte/components/Header/HeaderNavItem.svelte'

  import Debug from "debug"
  const debug = Debug("blueprint:App")  // Don't forget to set environment variable with 'DEBUG=blueprint:*' and localStorage with debug='blueprint:*'

  import logo from './assets/transformation-blueprint-logo.png'

  import {link as routerLink, location} from 'svelte-spa-router'  // TODO: Move these to svelte-viewstate-store 

  import Icon from 'svelte-awesome'
  import signOut from 'svelte-awesome/icons/sign-out'

  // import {ViewstateStore} from '@transformation-dev/svelte-viewstate-store'

  import { routes, activeComponent } from './router'
  import { authorizedTreeStore, chosenOrgBreadcrumbsArrayStore, authenticated, addToast } from './stores'
  import UnderlineTab from './components/UnderlineTab.svelte'
  import Toasts from './components/Toasts.svelte'
  import SearchableTreePanel from './components/SearchableTreePanel.svelte'
  // import AppUsingBulma from './App-using-Bulma.svelte'
  // import BreadcrumbsPanel from './components/BreadcrumbsPanel.svelte'
  // import Counter from './lib/Counter.svelte'

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
    if (parsed.authenticated === false) {
      addToast({ messageType: 'success', message: 'You are logged out'})
    }
  }

  function handleOrgChosen(newBreadcrumbsArray) {
    // Fetch org if different from before
    $chosenOrgBreadcrumbsArrayStore = newBreadcrumbsArray
    console.log("in handleOrgChosen. newBreadcrumbsArray: ", newBreadcrumbsArray)

    // setTimeout(() => {
    //   if ($chosenOrgBreadcrumbsArrayStore.length > 0) {
    //     openBreadcrumbs()
    //   } else {
    //     openTree()
    //   }
    // }, 100)  // Simulates delay to do $authenticated and $connected checks
  }

</script>

<svelte:head>
  <title>Transformation Blueprint {$location}</title>
</svelte:head>

<div class="thin-divider"></div>

<Header css="header-overrides">
  <a slot="logoleft" class="focus-link" href="/#/">
    <img class="mbs8 mis8 logo" src={logo} alt="Transformation.dev Blueprint Logo">
  </a>
  <HeaderNav css="nav-overrides">
    {#each [...routes] as [route, value]}
      {#if value.navbarLabel}
        <HeaderNavItem css="nav-item-override">
          <UnderlineTab label={value.navbarLabel} href={route} />
        </HeaderNavItem>
      {/if}
    {/each}
  </HeaderNav>
  <button id="logout" slot="logoright" on:click={handleLogout}>
    <Icon scale={1.3} data={signOut} class="logout" />
  </button>
</Header>

<div class="flex">
  <SearchableTreePanel tree={$authorizedTreeStore} chosenBreadcrumbsArrayStore={chosenOrgBreadcrumbsArrayStore} />

  <!-- The resizer -->
  <div class="resizer" id="dragMe"></div>

  <!-- The right side -->
  <div class="flex flex-column flex-fill">
    <Toasts />
    <!-- The page -->
    <div id="page" class="p16 flex flex-column flex-fill">
      <svelte:component this={$activeComponent} />
    </div>
  </div>
</div>


<style>
  :root {
    --agnostic-primary: #077acb;
    --agnostic-primary-hover: #659ac1;
    --agnostic-primary-light: #dcf1ff;
    --agnostic-primary-border: #c1d9e9;
    --agnostic-primary-dark-original: #063f69;
    --agnostic-primary-dark: #29465B;
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
    --agnostic-gray-mid-dark: #555555;
    --agnostic-gray-dark: #353535;
    --agnostic-dark: #1c1c1c;
    --agnostic-light: #fff;
    --agnostic-disabled-bg: var(--agnostic-gray-light);
    --agnostic-disabled-color: var(--agnostic-gray-dark);
    --agnostic-focus-ring-outline-width: 3px;

    --agnostic-header-content-width: 100%;
    --agnostic-header-background-color: var(--agnostic-primary-dark);
    --agnostic-header-color: var(--agnostic-primary-light);
    --agnostic-header-border-color: var(--agnostic-primary-dark);
    --agnostic-vertical-pad: 0px;
    --agnostic-header-nav-spacing: 0px;

    --agnostic-font-weight-light: 300;
    --agnostic-font-family-serif: Georgia, Cambria, "Times New Roman", Times, serif;
    --agnostic-font-family-body: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, "Helvetica Neue", sans-serif;

    --fluid-24: 0px;

    --blueprint-culture: #49826A;
    --blueprint-actions: #80AB9B;
    --blueprint-words: #BFD5CC;
    --blueprint-thoughts: #FFFFFF;
    --blueprint-unknown: #A8C4D8;
    --blueprint-tradeoff: #CCCCCC;
  }

  .header-overrides {
    padding-block-start: 0px;
    border: 0px;
    border-bottom: 0px !important;
  }

  .nav-overrides {
    height: 100%;
    padding-block-start: 0px;
    margin-inline-end: 0px;
  }

  .nav-item-override {
    padding-inline-start: 0px;
    margin-inline-end: 0px;
  }

  .thin-divider {
    background-color: var(--blueprint-culture);
    height: 5px;
  }

  .logo {
    max-height: 30px;
    margin-inline-end: 8px;
  }

  /* Focusing the button with a keyboard will show a focus ring. */
  .focus-link:focus-visible {
    outline: 3px var(--agnostic-primary-light);
  }
  
  /* Focusing the button with a mouse, touch, or stylus will make it look like a button is down. */
  .focus-link:focus:not(:focus-visible) {
    outline: 0px;
    box-shadow: inset 1px 1px 5px black;
  }

  a {
    color: var(--agnostic-primary);
  }

  .logout:hover,
  #logout:hover,
  a:hover { 
    color: var(--agnostic-primary-hover);
    cursor: pointer;
  }

  .logout,
  #logout {
    margin-inline-end: 8px; 
    margin-block-start: 8px;
    color: var(--agnostic-primary-light);
    background-color: inherit;
    border: 0px;
  }

  /* #page {
    padding: 1rem;
  } */

  :root {
    font-family: var(--agnostic-font-family-body);
    font-weight: var(--agnostic-font-weight-light);
  }

</style>
