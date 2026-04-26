/**
 * Structural finding tests.
 *
 * These tests verify the confirmed termination sequences from the experimental
 * programme.  They do NOT hard-code I values (which depend on accumulated state
 * and may diverge from prior-session numbers) — they verify ORDER, MODE, and
 * STEP NUMBER, which are the structurally meaningful results.
 *
 * Finding 27 (canonical seed=1.0, wide-30):
 *   011@n=4 (Uncon) → j-2 Module birth ≤ n=5 → F@n=7 (Uncon) → I/1@n=9 (Severance)
 *
 * Finding 32 (low seed=0.01, wide-30):
 *   011@n=16 (Uncon) → F@n=21 (Uncon) → I/1@n=23 (Severance)
 *   j-2 Module birth between n=10 and n=14 (mid-ecosystem)
 *
 * Finding 35 (low seed, merges ≥ 20 for full ecosystem run):
 *   Competitive compression is measurable at low seed.
 */
import { describe, it, expect } from 'vitest'
import { runEcosystem } from '../src/ecosystem.js'
import { CONFIG_CANONICAL, CONFIG_GAME } from '../src/constants.js'
import type { EcosystemState } from '../src/types.js'

function terminationStep(state: EcosystemState, type: string): number | null {
  for (const m of state.models.values()) {
    if (m.type === type) return m.terminationStep
  }
  return null
}

function terminationMode(state: EcosystemState, type: string): string | null {
  for (const m of state.models.values()) {
    if (m.type === type) return m.terminationMode
  }
  return null
}

function allTerminated(state: EcosystemState): boolean {
  return [...state.models.values()].every(m => !m.active)
}

// ── Finding 27: canonical seed termination sequence ───────────────────────────

describe('Finding 27 — canonical seed (1.0) termination sequence', () => {
  const state = runEcosystem(CONFIG_CANONICAL)

  it('all models terminate', () => {
    expect(allTerminated(state)).toBe(true)
  })

  it('011 terminates via Uncon', () => {
    expect(terminationMode(state, 'M011')).toBe('Uncon')
  })

  it('011 terminates at n=4', () => {
    expect(terminationStep(state, 'M011')).toBe(4)
  })

  it('j-2 terminates via ModuleBirth', () => {
    expect(terminationMode(state, 'Mj2')).toBe('ModuleBirth')
  })

  it('j-2 Module birth at n≤9 (before I/1 severance)', () => {
    const j2step = terminationStep(state, 'Mj2')
    expect(j2step).not.toBeNull()
    expect(j2step!).toBeLessThanOrEqual(9)
  })

  it('F terminates via Uncon at n=7', () => {
    expect(terminationMode(state, 'MF')).toBe('Uncon')
    expect(terminationStep(state, 'MF')).toBe(7)
  })

  it('I/1 terminates via Severance at n=9', () => {
    expect(terminationMode(state, 'MI1')).toBe('Severance')
    expect(terminationStep(state, 'MI1')).toBe(9)
  })

  it('termination order: 011 before F before I/1', () => {
    const t011 = terminationStep(state, 'M011')!
    const tF   = terminationStep(state, 'MF')!
    const tI1  = terminationStep(state, 'MI1')!
    expect(t011).toBeLessThan(tF)
    expect(tF).toBeLessThan(tI1)
  })
})

// ── Finding 32/34: low seed termination sequence ──────────────────────────────

describe('Finding 32/34 — game seed (0.01) termination sequence', () => {
  const state = runEcosystem(CONFIG_GAME)

  it('all models terminate', () => {
    expect(allTerminated(state)).toBe(true)
  })

  it('011 terminates via Uncon at n=16', () => {
    expect(terminationMode(state, 'M011')).toBe('Uncon')
    expect(terminationStep(state, 'M011')).toBe(16)
  })

  it('F terminates via Uncon at n=21', () => {
    expect(terminationMode(state, 'MF')).toBe('Uncon')
    expect(terminationStep(state, 'MF')).toBe(21)
  })

  it('I/1 terminates via Severance at n=23', () => {
    expect(terminationMode(state, 'MI1')).toBe('Severance')
    expect(terminationStep(state, 'MI1')).toBe(23)
  })

  it('j-2 Module birth is mid-ecosystem (n=10–14)', () => {
    const j2step = terminationStep(state, 'Mj2')
    expect(j2step).not.toBeNull()
    expect(j2step!).toBeGreaterThanOrEqual(10)
    expect(j2step!).toBeLessThanOrEqual(14)
  })

  it('j-2 Module birth precedes 011 termination', () => {
    const j2step  = terminationStep(state, 'Mj2')!
    const t011    = terminationStep(state, 'M011')!
    expect(j2step).toBeLessThan(t011)
  })
})

// ── Finding 35: competitive compression at low seed ───────────────────────────

describe('Finding 35 — competitive compression measurable at low seed', () => {
  it('≥ 20 substrate merges over the full game run', () => {
    const state = runEcosystem(CONFIG_GAME)
    expect(state.substrate.mergeCount).toBeGreaterThanOrEqual(20)
  })

  it('canonical seed produces fewer merges than game seed', () => {
    const canonical = runEcosystem(CONFIG_CANONICAL)
    const game      = runEcosystem(CONFIG_GAME)
    expect(game.substrate.mergeCount).toBeGreaterThan(canonical.substrate.mergeCount)
  })
})

// ── Finding 6: I is an accelerant (higher seed → earlier termination) ─────────

describe('Finding 6 — I is an accelerant', () => {
  it('higher engine seed terminates I/1 sooner', () => {
    const low  = runEcosystem(CONFIG_GAME)      // seed 0.01
    const high = runEcosystem(CONFIG_CANONICAL) // seed 1.0
    const tLow  = terminationStep(low,  'MI1')!
    const tHigh = terminationStep(high, 'MI1')!
    expect(tHigh).toBeLessThan(tLow)
  })
})
