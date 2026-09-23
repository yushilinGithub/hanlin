import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { headerNames } from '../logging.js'

describe('headerNames', () => {
  it('reads a Headers instance', () => {
    const h = new Headers({ 'X-Test': '1', 'Retry-After': '5' })
    assert.deepEqual(headerNames(h).sort(), ['retry-after', 'x-test'])
  })

  // The Anthropic SDK pinned here (0.39) puts a plain object on APIError.headers;
  // newer versions use Headers. Calling forEach on the plain one threw
  // "headers.forEach is not a function" while logging any API error.
  it('reads the plain object shape from APIError.headers', () => {
    assert.deepEqual(headerNames({ 'X-Test': '1', 'Retry-After': '5' }).sort(), ['retry-after', 'x-test'])
  })

  // Array#forEach hands back (element, index), so an entry-pairs array must not
  // take the Headers branch.
  it('reads an array of [name, value] pairs', () => {
    assert.deepEqual(headerNames([['X-Test', '1'], ['Retry-After', '5']]).sort(), ['retry-after', 'x-test'])
  })

  it('handles undefined', () => {
    assert.deepEqual(headerNames(undefined), [])
  })
})
