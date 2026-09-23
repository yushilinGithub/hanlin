import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  _resetTmuxControlModeProbeForTesting,
  isFullscreenEnvEnabled,
  isMouseClicksDisabled,
  isMouseTrackingEnabled,
} from '../fullscreen.js'

const VARS = [
  'HANLIN_NO_FLICKER',
  'CLAUDE_CODE_NO_FLICKER',
  'HANLIN_DISABLE_MOUSE',
  'CLAUDE_CODE_DISABLE_MOUSE',
  'HANLIN_DISABLE_MOUSE_CLICKS',
  'CLAUDE_CODE_DISABLE_MOUSE_CLICKS',
  'USER_TYPE',
  'TMUX',
  'TERM_PROGRAM',
]

beforeEach(() => {
  for (const v of VARS) Reflect.deleteProperty(process.env, v)
  _resetTmuxControlModeProbeForTesting()
})

describe('isFullscreenEnvEnabled', () => {
  it('defaults to on — this is what makes rows clickable', () => {
    assert.equal(isFullscreenEnvEnabled(), true)
  })

  it('stays on for ordinary users (no USER_TYPE=ant needed)', () => {
    process.env.USER_TYPE = 'external'
    assert.equal(isFullscreenEnvEnabled(), true)
  })

  it('opts out with either variable set falsy', () => {
    process.env.HANLIN_NO_FLICKER = '0'
    assert.equal(isFullscreenEnvEnabled(), false)
    Reflect.deleteProperty(process.env, 'HANLIN_NO_FLICKER')
    process.env.CLAUDE_CODE_NO_FLICKER = '0'
    assert.equal(isFullscreenEnvEnabled(), false)
  })

  it('an empty HANLIN_* does not mask a set CLAUDE_CODE_*', () => {
    process.env.HANLIN_NO_FLICKER = ''
    process.env.CLAUDE_CODE_NO_FLICKER = '0'
    assert.equal(isFullscreenEnvEnabled(), false)
  })

  it('opts in explicitly with either variable set truthy', () => {
    process.env.HANLIN_NO_FLICKER = '1'
    assert.equal(isFullscreenEnvEnabled(), true)
  })
})

describe('mouse switches', () => {
  it('tracking is on by default and off under either disable variable', () => {
    assert.equal(isMouseTrackingEnabled(), true)
    process.env.HANLIN_DISABLE_MOUSE = '1'
    assert.equal(isMouseTrackingEnabled(), false)
    Reflect.deleteProperty(process.env, 'HANLIN_DISABLE_MOUSE')
    process.env.CLAUDE_CODE_DISABLE_MOUSE = '1'
    assert.equal(isMouseTrackingEnabled(), false)
  })

  it('clicks are enabled by default and disabled under either variable', () => {
    assert.equal(isMouseClicksDisabled(), false)
    process.env.HANLIN_DISABLE_MOUSE_CLICKS = '1'
    assert.equal(isMouseClicksDisabled(), true)
    Reflect.deleteProperty(process.env, 'HANLIN_DISABLE_MOUSE_CLICKS')
    process.env.CLAUDE_CODE_DISABLE_MOUSE_CLICKS = '1'
    assert.equal(isMouseClicksDisabled(), true)
  })
})
