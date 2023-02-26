import fetch, {
  // Blob,
  // blobFrom,
  // blobFromSync,
  // File,
  // fileFrom,
  // fileFromSync,
  // FormData,
  Headers,
  Request,
  Response,
} from 'node-fetch'

export function initFetchPolyfill() {
  if (!globalThis.fetch) {
    globalThis.fetch = fetch
    globalThis.Headers = Headers
    globalThis.Request = Request
    globalThis.Response = Response
  }
}

initFetchPolyfill()  // The mere act of importing this module will initialize the polyfill
