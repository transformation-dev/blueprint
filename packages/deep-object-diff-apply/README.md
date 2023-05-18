# `@transformation-dev/deep-object-diff-apply`

Take the output of deep-object-diff's diff() function, apply it to the original lhs, and you get the original rhs.

## Usage

```js
import { diff } from 'deep-object-diff';
import { applyDiff } from '@transformation-dev/deep-object-diff-apply';

const lhs = { a: 1, b: 2, c: 3 };
const rhs = { a: 1, b: 4, d: 5 };
const differences = diff(lhs, rhs);
const restoredRHS = applyDiff(lhs, differences);
expect(restoredRHS).toEqual(rhs);
```

## Installation

```bash
npm install @transformation-dev/deep-object-diff-apply
```

## Notes

This function modifies lhs in place to be optimal for updating a large object with a
small diff you send over a network.

The tests come from deep-object-diff's test suite.

However, to get all of the tests to pass, I had to add quite a bit of complexity. When you
compare two primatives (string, number, etc) or quasi-primative (String, Number, Date, etc.)
deep-object-diff returns the rhs (quasi)primative as the diff. Maybe there is a more
efficient way to test for this than what I've implemented, but this works at least for
all of deep-object-diff's tests.

If you make the assumption that the lhs and rhs are both plain objects, then this code
would be alot simpler and would run faster. That said, I'm confident that even with this
complexity, the time to apply the diff is a very small fraction of the transmission time 
of the diff itself and worth it to work correctly with every possible deep-object-diff output.
