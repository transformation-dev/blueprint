import { describe, test, expect } from 'vitest'
import { diff } from 'deep-object-diff'

import { applyDiff } from '../apply-diff.js'

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
      // ['function', () => ({})],  // See 'equal Function' test below
      ['date', new Date()],
      ['date with milliseconds', new Date('2017-01-01T00:00:00.637Z')],
    ])('returns empty object when given values of type %s are equal to %s', (type, value) => {
      const d = diff(value, value)
      expect(d).toEqual({})
      const newValue = structuredClone(value)  // does not work for Function
      const restoredRHS = applyDiff(newValue, d)
      expect(restoredRHS).to.deep.equal(value)
    })

    test('equal Function', () => {
      const value = () => ({})
      const d = diff(value, value)
      expect(d).toEqual({})
      const restoredRHS = applyDiff(value, d)
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
      const lhs = { a: { b: 1, c: 2 } }
      const rhs = { a: { b: 1, c: 3 } }
      const d = diff(lhs, rhs)
      expect(d).toEqual({ a: { c: 3 } })
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns subset of right hand side value when nested values differ at multiple paths', () => {
      const lhs = { a: { b: 1 }, c: 2, d: { e: 100 } }
      const rhs = { a: { b: 99 }, c: 3, d: { e: 100 } }
      const d = diff(lhs, rhs)
      expect(d).toEqual({ a: { b: 99 }, c: 3 })
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns subset of right hand side value when a key value has been deleted', () => {
      const lhs = { a: { b: 1 }, c: 2, d: { e: 100 } }
      const rhs = { a: { b: 1 }, c: 2, d: {} }
      const d = diff(lhs, rhs)
      expect(d).toEqual({ d: { e: undefined } })
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns subset of right hand side value when a key value has been added', () => {
      const lhs = { a: 1 }
      const rhs = { a: 1, b: 2 }
      const d = diff(lhs, rhs)
      expect(d).toEqual({ b: 2 })
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns keys as undefined when deleted from right hand side', () => {
      const lhs = { a: 1, b: { c: 2 } }
      const rhs = { a: 1 }
      const d = diff(lhs, rhs)
      expect(d).toEqual({ b: undefined })
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })
  })

  describe('arrays', () => {
    test('return right hand side empty object value when left hand side has been updated', () => {
      const lhs = [{ a: 1 }]
      const rhs = [{ a: {} }]
      const d = diff(lhs, rhs)
      expect(d).toEqual({ 0: { a: {} } })
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })
    test('returns right hand side value as object of indices to value when arrays are different', () => {
      const lhs = [1]
      const rhs = [2]
      const d = diff(lhs, rhs)
      expect(d).toEqual({ 0: 2 })
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns subset of right hand side array as object of indices to value when arrays differs at multiple indicies', () => {
      const lhs = [1, 2, 3]
      const rhs = [9, 8, 3]
      const d = diff(lhs, rhs)
      expect(d).toEqual({ 0: 9, 1: 8 })
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns subset of right hand side array as object of indices to value when right hand side array has deletions', () => {
      const lhs = [1, 2, 3]
      const rhs = [1, 3]
      const d = diff(lhs, rhs)
      expect(d).toEqual({ 1: 3, 2: undefined })
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns subset of right hand side array as object of indices to value when right hand side array has additions', () => {
      const lhs = [1, 2, 3]
      const rhs = [1, 2, 3, 9]
      const d = diff(lhs, rhs)
      expect(d).toEqual({ 3: 9 })
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })
  })

  describe('date', () => {
    const lhsDate = new Date('2016')
    const rhsDate = new Date('2017')

    test('returns empty object when dates are equal', () => {
      const lhs = new Date('2016')
      const rhs = new Date('2016')
      const d = diff(lhs, rhs)
      expect(d).toEqual({})
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns right hand side date when updated', () => {
      let lhs = { date: lhsDate }
      let rhs = { date: rhsDate }
      const d = diff(lhs, rhs)
      expect(d).toEqual({ date: rhsDate })
      let restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)

      lhs = [lhsDate]
      rhs = [rhsDate]
      const d2 = diff(lhs, rhs)
      expect(d2).toEqual({ 0: rhsDate })
      restoredRHS = applyDiff(lhs, d2)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns undefined when date deleted', () => {
      let lhs = { date: lhsDate }
      let rhs = {}
      const d = diff(lhs, rhs)
      expect(d).toEqual({ date: undefined })
      let restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)

      lhs = [lhsDate]
      rhs = []
      const d2 = diff(lhs, rhs)
      expect(d2).toEqual({ 0: undefined })
      restoredRHS = applyDiff(lhs, d2)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns right hand side when date is added', () => {
      let lhs = {}
      let rhs = { date: rhsDate }
      const d = diff(lhs, rhs)
      expect(d).toEqual({ date: rhsDate })
      let restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)

      lhs = []
      rhs = [rhsDate]
      const d2 = diff(lhs, rhs)
      expect(d2).toEqual({ 0: rhsDate })
      restoredRHS = applyDiff(lhs, d2)
      expect(restoredRHS).to.deep.equal(rhs)
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
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
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
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns subset of right hand side value when nested values differ', () => {
      const lhs = Object.create(null)
      lhs.a = { b: 1, c: 2 }
      const rhs = Object.create(null)
      rhs.a = { b: 1, c: 3 }
      const d = diff(lhs, rhs)
      expect(d).toEqual({ a: { c: 3 } })
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
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
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns subset of right hand side value when a key value has been deleted', () => {
      const lhs = Object.create(null)
      lhs.a = { b: 1 }
      lhs.c = 2
      const rhs = Object.create(null)
      rhs.a = { b: 1 }
      const d = diff(lhs, rhs)
      expect(d).toEqual({ c: undefined })
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })

    test('returns subset of right hand side value when a key value has been added', () => {
      const lhs = Object.create(null)
      lhs.a = 1
      const rhs = Object.create(null)
      rhs.a = 1
      rhs.b = 2
      const d = diff(lhs, rhs)
      expect(d).toEqual({ b: 2 })
      const restoredRHS = applyDiff(lhs, d)
      expect(restoredRHS).to.deep.equal(rhs)
    })
  })
})
