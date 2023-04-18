/* eslint-disable no-param-reassign */

import { throwIf } from './throws.js'
import { requestOutResponseIn } from './content-processor.js'
import { HTTPError } from './http-error.js'

// These are methods that are common to all TemporalEntities including Tree
// This assumes that this.entityMeta is defined and it has a timeline property. Note, it can have other properties as well.
export default {
  async callDO(type, version, options, expectedResponseCode, idString) {  // TODO: Move this to a mixin to share with Tree
    let id
    let url = `http://fake.host/${type}/${version}/`
    if (idString == null) {
      id = this.env[this.typeVersionConfig.doBinding].newUniqueId()
    } else {
      id = this.env[this.typeVersionConfig.doBinding].idFromString(idString)
      url += `${idString}/`
    }
    const entityStub = this.env[this.typeVersionConfig.doBinding].get(id)
    const response = await requestOutResponseIn(url, options, entityStub)  // TODO: Pass along the cookies
    if (response.status !== expectedResponseCode) {
      if (response.status >= 400) {
        throw new HTTPError(response.content.error.message, response.status, response.content)
      } else {
        throwIf(
          true,  // because we checked for expectedResponseCode above
          `Unexpected response code ${response.status} from call to ${url}`,
          response.status,
          response.content,
        )
      }
    }
    return response
  },

  async hardDeleteDO(idString) {  // TODO: Move this to a mixin to share with Tree
    throwIf(idString == null, 'Required parameter, idString, missing from call to hardDeleteDO()')
    const options = {
      method: 'DELETE',
    }
    const url = `http://fake.host/transactional-do-wrapper/${idString}`
    const id = this.env[this.typeVersionConfig.doBinding].idFromString(idString)
    const entityStub = this.env[this.typeVersionConfig.doBinding].get(id)
    const response = await requestOutResponseIn(url, options, entityStub)  // TODO: Pass along the cookies
    if (response.status >= 400) {
      const { error } = response.content
      throwIf(
        true,
        error?.message || `Unexpected response code ${response.status} from call to ${url}`,
        response.status,
        response.content,
      )
    }
    return response
  },

}
