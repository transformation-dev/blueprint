import { TemporalEntity } from './temporal-entity.js'
import { throwIf } from './throws.js'

export class Person extends TemporalEntity {
  async post(value, userID, validFrom, impersonatorID, ifUnmodifiedSince) {
    throwIf(value?.emailAddresses?.length < 1, 'value.emailAddresses must have at least one email address', 400)
    if (userID === 'self') {
      await this.hydrate()
      // eslint-disable-next-line no-param-reassign
      if (this.entityMeta?.timeline?.length === 0) userID = this.idString
      else throwIf(true, 'userID "self" only allowed when a Person is first created')
    }
    // eslint-disable-next-line no-param-reassign
    value.emailAddresses = value.emailAddresses.map((emailAddress) => emailAddress.toLowerCase())
    return super.post(value, userID, validFrom, impersonatorID, ifUnmodifiedSince)
  }
}
