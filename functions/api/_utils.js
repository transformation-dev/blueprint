import Debug from 'debug'

export const jsonResponse = (value) => new Response(JSON.stringify(value), {
  headers: { 'Content-Type': 'application/json' },
})

export const getDebug = (name) => {
  const debugRaw = Debug(name)
  return function debug(value) {
    // eslint-disable-next-line no-console
    console.log('\n')
    debugRaw(value)
  }
}
