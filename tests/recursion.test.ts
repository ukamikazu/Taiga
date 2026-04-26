import { describe, it, expect } from 'vitest'
import { engineStep, parity, computeI } from '../src/engine/recursion.js'

describe('parity indicators', () => {
  it('even steps have delta=1, nabla=0', () => {
    for (const n of [0, 2, 4, 6, 8]) {
      const p = parity(n)
      expect(p.delta).toBe(1)
      expect(p.nabla).toBe(0)
    }
  })

  it('odd steps have delta=0, nabla=1', () => {
    for (const n of [1, 3, 5, 7, 9]) {
      const p = parity(n)
      expect(p.delta).toBe(0)
      expect(p.nabla).toBe(1)
    }
  })
})

describe('recursion engine (Eqs 35–36)', () => {
  // Canonical seed y00=y10=1.0
  const cfg = { y00: 1.0, y10: 1.0 }

  it('n=0 (even): y0=1, y1=0', () => {
    const s = engineStep(cfg, 0)
    expect(s.y0).toBeCloseTo(1)
    expect(s.y1).toBeCloseTo(0)
  })

  it('n=1 (odd): y0=4, y1=-2', () => {
    const s = engineStep(cfg, 1)
    expect(s.y0).toBeCloseTo(4)
    expect(s.y1).toBeCloseTo(-2)
  })

  it('n=2 (even): y0=2, y1=0', () => {
    const s = engineStep(cfg, 2)
    expect(s.y0).toBeCloseTo(2)
    expect(s.y1).toBeCloseTo(0)
  })

  it('n=3 (odd): y0=8, y1=-4', () => {
    const s = engineStep(cfg, 3)
    expect(s.y0).toBeCloseTo(8)
    expect(s.y1).toBeCloseTo(-4)
  })

  it('n=4 (even): y0=4, y1=0', () => {
    const s = engineStep(cfg, 4)
    expect(s.y0).toBeCloseTo(4)
    expect(s.y1).toBeCloseTo(0)
  })

  it('n=5 (odd): y0=16, y1=-8  — S-1 I=16 anchor point (Finding 19)', () => {
    const s = engineStep(cfg, 5)
    expect(s.y0).toBeCloseTo(16)
    expect(s.y1).toBeCloseTo(-8)
  })

  it('amplitude doubles every two steps', () => {
    for (let n = 0; n < 8; n += 2) {
      const curr = engineStep(cfg, n)
      const next = engineStep(cfg, n + 2)
      expect(next.y0 / curr.y0).toBeCloseTo(2)
    }
  })

  it('low-seed y0 at canonical steps match seed ratio', () => {
    const low = { y00: 0.01, y10: 0.01 }
    for (const n of [0, 1, 3, 5, 9]) {
      const hi  = engineStep(cfg, n)
      const lo  = engineStep(low, n)
      // At equal seeds y00=y10, the ratio is exactly seed_low/seed_hi
      expect(lo.y0 / hi.y0).toBeCloseTo(0.01)
    }
  })
})

describe('computeI = |y0_n| × (degree+1)', () => {
  const cfg = { y00: 1.0, y10: 1.0 }

  it('degree=0 gives I = |y0|', () => {
    const s = engineStep(cfg, 1) // y0=4
    expect(computeI(s, 0)).toBeCloseTo(4)
  })

  it('degree=4 at n=4: I = 4 × 5 = 20  — θ_011 anchor (011@n=4)', () => {
    const s = engineStep(cfg, 4) // y0=4
    expect(computeI(s, 4)).toBeCloseTo(20)
  })
})
