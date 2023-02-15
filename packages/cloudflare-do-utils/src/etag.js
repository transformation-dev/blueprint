export function extractETag(request) {
  let eTag = request.headers.get('If-Match')
  if (!eTag) eTag = request.headers.get('If-None-Match')
  if (eTag === 'undefined' || eTag === 'null') return undefined
  return eTag
}
