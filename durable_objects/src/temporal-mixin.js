import { throwIfAcceptHeaderInvalid, throwIf } from '@transformation-dev/cloudflare-do-utils'

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
    try {
      throwIfAcceptHeaderInvalid(request)
      const ifModifiedSince = request.headers.get('If-Modified-Since')
      const ifModifiedSinceISOString = ifModifiedSince ? new Date(ifModifiedSince).toISOString() : undefined
      const url = new URL(request.url)
      const asOf = url.searchParams.get('asOf')
      const asOfISOString = asOf ? new Date(asOf).toISOString() : undefined
      const [response, status] = await this.get({ ifModifiedSinceISOString, asOfISOString })
      if (status === 304) return this.getStatusOnlyResponse(304)
      return this.getResponse(response)
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate
      return this.getErrorResponse(e)
    }
  },

  async getEntityMeta(ifModifiedSinceISOString) {
    await this.hydrate()
    if (this.entityMeta.timeline.at(-1) <= ifModifiedSinceISOString) return [undefined, 304]
    return [this.entityMeta, 200]
  },

  async GETEntityMeta(request) {
    try {
      throwIfAcceptHeaderInvalid(request)
      const ifModifiedSince = request.headers.get('If-Modified-Since')
      const ifModifiedSinceISOString = ifModifiedSince ? new Date(ifModifiedSince).toISOString() : undefined
      const [entityMeta, status] = await this.getEntityMeta(ifModifiedSinceISOString)
      if (status === 304) return this.getStatusOnlyResponse(304)
      return this.getResponse(entityMeta, status)
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate
      return this.getErrorResponse(e)
    }
  },
}
