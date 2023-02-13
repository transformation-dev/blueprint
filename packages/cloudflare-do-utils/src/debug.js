// 3rd party imports
import Debug from 'debug'

function getDebug(name, delay = 50) {
  const debugRaw = Debug(name)
  let quiescent = true
  let theTimeout
  const theFunction = function debug(...values) {
    clearTimeout(theTimeout)
    theTimeout = setTimeout(() => {
      quiescent = true
    }, delay)
    if (quiescent) {
      // eslint-disable-next-line no-console
      console.error('')
      quiescent = false
    }
    debugRaw(...values)
  }
  return theFunction
}

export { getDebug, Debug }
