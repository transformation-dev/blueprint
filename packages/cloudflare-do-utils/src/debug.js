// 3rd party imports
import Debug from 'debug'

function getDebug(name, delay = 50) {
  const debugRaw = Debug(name)
  debugRaw.log = console.log.bind(console)
  let quiescent = true
  let theTimeout
  const theFunction = function debug(...values) {
    clearTimeout(theTimeout)
    theTimeout = setTimeout(() => {
      quiescent = true
    }, delay)
    if (quiescent) {
      // eslint-disable-next-line no-console
      console.log('')  // change to console.error if I switch back and remove `debugRaw.log = console.log.bind(console)` abvoe
      quiescent = false
    }
    debugRaw(...values)
  }
  return theFunction
}

export { getDebug, Debug }
