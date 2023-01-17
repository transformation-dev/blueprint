import { TemporalEntityBase } from './temporal-entity-base.js'
import types from './types.js'

export class TemporalEntity extends TemporalEntityBase {
  static types = {
    ...super.types,
    ...types,
  }
}
