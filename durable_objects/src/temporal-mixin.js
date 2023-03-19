import { throwIfAcceptHeaderInvalid, throwIf, dateISOStringRegex } from '@transformation-dev/cloudflare-do-utils'

// These are methods that are common to all TemporalEntities including Tree
// This assumes that this.entityMeta is defined and it has a timeline property. Note, it can have other properties as well.
export const temporalMixin = {
  calculateValidFrom(validFrom) {  // This is the one from TemporalEntityBase not old Tree
    let validFromDate
    let newValidFrom
    if (validFrom != null) {
      if (this.entityMeta?.timeline?.length > 0) {
        throwIf(validFrom <= this.entityMeta.timeline.at(-1), 'the validFrom for a TemporalEntity update is not greater than the prior validFrom')
      }
      newValidFrom = validFrom
      validFromDate = new Date(validFrom)
    } else {
      validFromDate = new Date()
      if (this.entityMeta?.timeline?.length > 0) {
        const lastTimelineDate = new Date(this.entityMeta.timeline.at(-1))
        if (validFromDate <= lastTimelineDate) {
          validFromDate = new Date(lastTimelineDate.getTime() + 1)
        }
        newValidFrom = new Date(validFromDate).toISOString()
      } else {
        newValidFrom = validFromDate.toISOString()
        validFromDate = new Date(validFrom)
      }
    }
    return { validFrom: newValidFrom, validFromDate }
  },

  async GET(request) {
    throwIfAcceptHeaderInvalid(request)
    const ifModifiedSince = request.headers.get('If-Modified-Since')
    const url = new URL(request.url)
    const asOf = url.searchParams.get('asOf')
    const asOfISOString = asOf ? new Date(asOf).toISOString() : undefined  // TODO: Maybe we should require ISO-8601 format?
    const [response, status] = await this.get({ ifModifiedSince, asOfISOString })
    if (status === 304) return this.getStatusOnlyResponse(304)
    return this.getResponse(response)
  },

  async getEntityMeta(ifModifiedSince) {
    throwIf(
      ifModifiedSince != null && !dateISOStringRegex.test(ifModifiedSince),
      'If-Modified-Since must be in YYYY:MM:DDTHH:MM:SS.mmmZ format because we need millisecond granularity',
      400,
      this.current,
    )
    await this.hydrate()
    if (this.entityMeta.timeline.at(-1) <= ifModifiedSince) return [undefined, 304]
    return [this.entityMeta, 200]
  },

  async GETEntityMeta(request) {
    throwIfAcceptHeaderInvalid(request)
    const ifModifiedSince = request.headers.get('If-Modified-Since')
    const [entityMeta, status] = await this.getEntityMeta(ifModifiedSince)
    if (status === 304) return this.getStatusOnlyResponse(304)
    return this.getResponse(entityMeta, status)
  },
}
