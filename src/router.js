import Debug from 'debug'

import { location } from 'svelte-spa-router'
import { derived, get } from 'svelte/store'
import { readyToGo } from './stores'

// Real Routes
import Home from './routes/Home.svelte'
import Login from './routes/Login.svelte'
import Plan from './routes/Plan/index'
import Progress from './routes/Progress.svelte'
import NotFound from './routes/NotFound.svelte'

// Not real but don't delete. Needed for testing
import TestJig from './routes/TestJig.svelte'
import JsonInjection from './routes/JsonInjection.svelte'

// TODO: Clean up below once we have it all working
import Poc from './routes/Poc.svelte'
import Morgan from './routes/Morgan.svelte'
import RadarTest from './routes/RadarTest.svelte'
import RadarHolman from './routes/RadarHolman.svelte'

const debug = Debug('blueprint:router')  // Don't forget to set environment variable with 'DEBUG=blueprint:*' and localStorage with debug='blueprint:*'

export const routes = new Map(Object.entries({
  // Real routes
  '/': { component: Home, allowUnauthenticated: true },
  '/login': { component: Login, allowUnauthenticated: true },
  '/plan': { component: Plan, navbarLabel: 'Plan' },
  '/progress': { component: Progress, navbarLabel: 'Progress' },

  // Don't delete. Required for testing or demo
  '/test-jig': TestJig,
  '/radar-test': { component: RadarTest, allowUnauthenticated: true },
  '/json-injection': { component: JsonInjection, allowUnauthenticated: true },

  // TODO: Clean up below once we know have examples of all
  '/poc': { component: Poc, navbarLabel: 'POC', allowUnauthenticated: true },
  '/morgan': Morgan,
  '/radar-holman-7bTyobXsPg8gpXon': { component: RadarHolman, allowUnauthenticated: true },

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
  Login,
)
