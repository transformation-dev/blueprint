export async function listAllKVKeys(kvNamespace, prefix) {
  let options = (prefix != null && prefix.length > 0) ? { prefix } : {}
  const result = {}
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const response = await kvNamespace.list(options)
    for (const key of response.keys) {
      result[key.name] = key.metadata
    }
    if (response.list_complete) break
    options = { cursor: response.cursor }
  }
  return result
}
