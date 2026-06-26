import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { norm, buildPageIndex } from '../capsule.js'

describe('norm', () => {
  it('lowercases and collapses whitespace', () => assert.equal(norm('  SVG   Capsule '), 'svg capsule'))
  it('handles empty', () => assert.equal(norm(), ''))
})

describe('buildPageIndex', () => {
  const idx = buildPageIndex([{ title: 'SVG Capsule', slug: 'svg-capsule' }, { title: 'Render Broker', slug: 'render-broker' }])
  it('indexes by normalised title', () => assert.equal(idx.get('svg capsule'), 'SVG Capsule'))
  it('indexes by slug', () => assert.equal(idx.get('render-broker'), 'Render Broker'))
  it('misses unknown', () => assert.equal(idx.get('nope'), undefined))
  it('handles empty list', () => assert.equal(buildPageIndex().size, 0))
})
