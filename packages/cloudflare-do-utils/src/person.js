import { TemporalEntity } from './temporal-entity.js'

export class Person extends TemporalEntity {
  async post(value, userID, validFrom, impersonatorID, ifUnmodifiedSince) {
    if (userID === 'self') {
      await this.hydrate()
      // eslint-disable-next-line no-param-reassign
      if (this.entityMeta?.timeline?.length === 0) userID = this.idString
    }
    return super.post(value, userID, validFrom, impersonatorID, ifUnmodifiedSince)
  }
}
