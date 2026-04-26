import { describe, it, expect } from 'vitest'
import {
  makeSubstrate,
  writeRecord,
  writeFrontier,
  load,
  density,
  visitedNodes,
} from '../src/engine/substrate.js'

describe('substrate basics', () => {
  it('starts empty', () => {
    const s = makeSubstrate(8)
    expect(load(s)).toBe(0)
    expect(density(s)).toBe(0)
    expect(s.mergeCount).toBe(0)
  })

  it('writeRecord increments load', () => {
    let s = makeSubstrate(8)
    s = writeRecord(s, { nodeId: 0, modelId: 'm1', step: 1 })
    expect(load(s)).toBe(1)
  })

  it('visitedNodes tracks unique node IDs', () => {
    let s = makeSubstrate(8)
    s = writeRecord(s, { nodeId: 0, modelId: 'm1', step: 1 })
    s = writeRecord(s, { nodeId: 0, modelId: 'm1', step: 2 }) // same node
    s = writeRecord(s, { nodeId: 1, modelId: 'm1', step: 2 })
    expect(visitedNodes(s).size).toBe(2) // only 2 unique nodes
  })

  it('density = L / |V|', () => {
    let s = makeSubstrate(8)
    // 4 records across 2 unique nodes → m = 4/2 = 2
    for (let i = 0; i < 4; i++) {
      s = writeRecord(s, { nodeId: i % 2, modelId: 'm1', step: i })
    }
    expect(density(s)).toBeCloseTo(2)
  })
})

describe('compression (A9 — substrate-level Uncon)', () => {
  it('fires when L reaches C, drops 2 oldest records', () => {
    let s = makeSubstrate(4) // C=4
    for (let i = 0; i < 4; i++) {
      s = writeRecord(s, { nodeId: i, modelId: 'm1', step: i })
    }
    // L=4 → compression fires on the 4th write
    expect(s.mergeCount).toBe(1)
    expect(load(s)).toBe(2) // 4 - 2 = 2 records remain
  })

  it('mergeCount accumulates across multiple compressions', () => {
    let s = makeSubstrate(4)
    for (let i = 0; i < 12; i++) {
      s = writeRecord(s, { nodeId: i, modelId: 'm1', step: i })
    }
    expect(s.mergeCount).toBeGreaterThanOrEqual(2)
  })
})

describe('writeFrontier', () => {
  it('writes one record per frontier node', () => {
    let s = makeSubstrate(32)
    s = writeFrontier(s, 'm1', [5, 6, 7], 1)
    expect(load(s)).toBe(3)
    const v = visitedNodes(s)
    expect(v.has(5)).toBe(true)
    expect(v.has(6)).toBe(true)
    expect(v.has(7)).toBe(true)
  })
})
