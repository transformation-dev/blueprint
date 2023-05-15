import { describe, test, expect } from 'vitest'
import { diff } from 'deep-object-diff'

import { applyDiff } from '../src/apply-diff.js'

describe('base case', () => {
  describe('equal', () => {
    test.each([
      ['int', 1],
      ['string', 'a'],
      ['boolean', true],
      ['null', null],
      ['undefined', undefined],
      ['object', { a: 1 }],
      ['array', [1]],
      // ['function', () => ({})],
      ['date', new Date()],
      ['date with milliseconds', new Date('2017-01-01T00:00:00.637Z')],
    ])('returns empty object when given values of type %s are equal to %s', (type, value) => {
      const d = diff(value, value)
      expect(d).toEqual({})
      const newValue = structuredClone(value)
      const restoredRHS = applyDiff(newValue, d)
      expect(restoredRHS).to.deep.equal(value)
    })
  })

  describe('not equal and not object', () => {
    test.each([
      [1, 2],
      ['a', 'b'],
      [true, false],
      ['hello', null],
      ['hello', undefined],
      [null, undefined],
      [undefined, null],
      [null, { a: 1 }],
      ['872983', { areaCode: '+44', number: '872983' }],
      [100, () => ({})],
      [() => ({}), 100],
      [new Date('2017-01-01'), new Date('2017-01-02')],
      [new Date('2017-01-01T00:00:00.636Z'), new Date('2017-01-01T00:00:00.637Z')],
    ])('returns right hand side value when different to left hand side value (%s, %s)', (lhs, rhs) => {
      const d = diff(lhs, rhs)
      expect(d).toEqual(rhs)
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })
  })
})

describe('recursive case', () => {
  describe('object', () => {
    test('return right hand side empty object value when left hand side has been updated', () => {
      const lhs = { a: 1 }
      const rhs = { a: {} }
      const d = diff(lhs, rhs)
      expect(d).toEqual(rhs)
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns right hand side value when given objects are different', () => {
      const lhs = { a: 1 }
      const rhs = { a: 2 }
      const d = diff(lhs, rhs)
      expect(d).toEqual(rhs)
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns right hand side value when right hand side value is null', () => {
      const lhs = { a: 1 }
      const rhs = { a: null }
      const d = diff(lhs, rhs)
      expect(d).toEqual(rhs)
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns subset of right hand side value when sibling objects differ', () => {
      const lhs = { a: { b: 1 }, c: 2 }
      const rhs = { a: { b: 1 }, c: 3 }
      const d = diff(lhs, rhs)
      expect(d).toEqual({ c: 3 })
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns subset of right hand side value when nested values differ', () => {
      const d = diff({ a: { b: 1, c: 2 } }, { a: { b: 1, c: 3 } })
      expect(d).toEqual({ a: { c: 3 } })
    })

    test('returns subset of right hand side value when nested values differ at multiple paths', () => {
      const d = diff({ a: { b: 1 }, c: 2, d: { e: 100 } }, { a: { b: 99 }, c: 3, d: { e: 100 } })
      expect(d).toEqual({ a: { b: 99 }, c: 3 })
    })

    test('returns subset of right hand side value when a key value has been deleted', () => {
      const d = diff({ a: { b: 1 }, c: 2, d: { e: 100 } }, { a: { b: 1 }, c: 2, d: {} })
      expect(d).toEqual({ d: { e: undefined } })
    })

    test('returns subset of right hand side value when a key value has been added', () => {
      const d = diff({ a: 1 }, { a: 1, b: 2 })
      expect(d).toEqual({ b: 2 })
    })

    test('returns keys as undefined when deleted from right hand side', () => {
      const d = diff({ a: 1, b: { c: 2 } }, { a: 1 })
      expect(d).toEqual({ b: undefined })
    })
  })

  describe('arrays', () => {
    test('return right hand side empty object value when left hand side has been updated', () => {
      const d = diff([{ a: 1 }], [{ a: {} }])
      expect(d).toEqual({ 0: { a: {} } })
    })
    test('returns right hand side value as object of indices to value when arrays are different', () => {
      const d = diff([1], [2])
      expect(d).toEqual({ 0: 2 })
    })

    test('returns subset of right hand side array as object of indices to value when arrays differs at multiple indicies', () => {
      const d = diff([1, 2, 3], [9, 8, 3])
      expect(d).toEqual({ 0: 9, 1: 8 })
    })

    test('returns subset of right hand side array as object of indices to value when right hand side array has deletions', () => {
      const d = diff([1, 2, 3], [1, 3])
      expect(d).toEqual({ 1: 3, 2: undefined })
    })

    test('returns subset of right hand side array as object of indices to value when right hand side array has additions', () => {
      const d = diff([1, 2, 3], [1, 2, 3, 9])
      expect(d).toEqual({ 3: 9 })
    })
  })

  describe('date', () => {
    const lhs = new Date('2016')
    const rhs = new Date('2017')

    test('returns empty object when dates are equal', () => {
      const d = diff(new Date('2016'), new Date('2016'))
      expect(d).toEqual({})
    })

    test('returns right hand side date when updated', () => {
      const d = diff({ date: lhs }, { date: rhs })
      expect(d).toEqual({ date: rhs })
      const d2 = diff([lhs], [rhs])
      expect(d2).toEqual({ 0: rhs })
    })

    test('returns undefined when date deleted', () => {
      const d = diff({ date: lhs }, {})
      expect(d).toEqual({ date: undefined })
      const d2 = diff([lhs], [])
      expect(d2).toEqual({ 0: undefined })
    })

    test('returns right hand side when date is added', () => {
      const d = diff({}, { date: rhs })
      expect(d).toEqual({ date: rhs })
      const d2 = diff([], [rhs])
      expect(d2).toEqual({ 0: rhs })
    })
  })

  describe('object create null', () => {
    test('returns right hand side value when given objects are different', () => {
      const lhs = Object.create(null)
      lhs.a = 1
      const rhs = Object.create(null)
      rhs.a = 2
      const d = diff(lhs, rhs)
      expect(d).toEqual({ a: 2 })
    })

    test('returns subset of right hand side value when sibling objects differ', () => {
      const lhs = Object.create(null)
      lhs.a = { b: 1 }
      lhs.c = 2
      const rhs = Object.create(null)
      rhs.a = { b: 1 }
      rhs.c = 3
      const d = diff(lhs, rhs)
      expect(d).toEqual({ c: 3 })
    })

    test('returns subset of right hand side value when nested values differ', () => {
      const lhs = Object.create(null)
      lhs.a = { b: 1, c: 2 }
      const rhs = Object.create(null)
      rhs.a = { b: 1, c: 3 }
      const d = diff(lhs, rhs)
      expect(d).toEqual({ a: { c: 3 } })
    })

    test('returns subset of right hand side value when nested values differ at multiple paths', () => {
      const lhs = Object.create(null)
      lhs.a = { b: 1 }
      lhs.c = 2
      const rhs = Object.create(null)
      rhs.a = { b: 99 }
      rhs.c = 3
      const d = diff(lhs, rhs)
      expect(d).toEqual({ a: { b: 99 }, c: 3 })
    })

    test('returns subset of right hand side value when a key value has been deleted', () => {
      const lhs = Object.create(null)
      lhs.a = { b: 1 }
      lhs.c = 2
      const rhs = Object.create(null)
      rhs.a = { b: 1 }
      const d = diff(lhs, rhs)
      expect(d).toEqual({ c: undefined })
    })

    test('returns subset of right hand side value when a key value has been added', () => {
      const lhs = Object.create(null)
      lhs.a = 1
      const rhs = Object.create(null)
      rhs.a = 1
      rhs.b = 2
      const d = diff(lhs, rhs)
      expect(d).toEqual({ b: 2 })
    })
  })
})
