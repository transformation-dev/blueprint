export const jsonResponse = (value) => new Response(JSON.stringify(value), {
  headers: { 'Content-Type': 'application/json' },
})
