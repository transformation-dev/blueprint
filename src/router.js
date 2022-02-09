import Debug from "debug"
const debug = Debug("matrx:router")  // Don't forget to set environment variable with 'DEBUG=matrx:*' and localStorage with debug='matrx:*'

import {location} from 'svelte-spa-router'
import {derived, get} from 'svelte/store'
import {readyToGo} from './stores'

// Real Routes
import Home from './routes/Home.svelte'
import Login from './routes/Login.svelte'
import Plan from './routes/Plan/index'
import Progress from './routes/Progress.svelte'
import NotFound from './routes/NotFound.svelte'

// Not real but don't delete. Needed for testing
import TestJig from './routes/TestJig.svelte'

// TODO: Clean up below once we have it all working
import Poc from './routes/Poc.svelte'
import Morgan from './routes/Morgan.svelte'

export const routes = new Map(Object.entries({
  // Real routes
  '/': {component: Home, allowUnauthenticated: true},
  '/login': {component: Login, allowUnauthenticated: true},
  '/plan': {component: Plan, navbarLabel: 'Plan'},
  '/progress': {component: Progress, navbarLabel: 'Progress'},

  // Don't delete. Required for Cypress testing
  '/test-jig': TestJig,

  // TODO: Clean up below once we know have examples of all
  '/poc': {component: Poc, allowUnauthenticated: true},
  '/morgan': Morgan,

  // Don't delete
  '*': NotFound,  // Catch-all
}))

debug('routes: %O', routes)
debug('$location: %O', get(location))
debug('$readyToGo: %O', get(readyToGo))

export const activeComponent = derived(
  [location, readyToGo],
  ([$location, $readyToGo]) => {
    debug('Inside activeComponent derivation callback. $location: %O, $readyToGo: %O', $location, $readyToGo)
    const routeValue = routes.get($location)
    if (!routeValue) {
      return routes.get('*').component || routes.get('*')
    }
    const component = routeValue.component || routeValue
    if (routeValue.allowUnauthenticated || $readyToGo === 'ready') {
      return component
    } else {
      return Login
    }
  },
  Login
)
