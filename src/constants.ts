import type { EcosystemConfig } from './types.js'
import {
  WIDE_011_ENTRY,
  WIDE_F_ENTRY,
  WIDE_J2_ENTRY,
  WIDE_I1_ENTRY,
} from './engine/dag.js'

// ── Engine seeds ──────────────────────────────────────────────────────────────

export const SEED_CANONICAL = { y00: 1.0,  y10: 1.0  }
export const SEED_GAME      = { y00: 0.01, y10: 0.01 }

// ── Trigger thresholds ────────────────────────────────────────────────────────
//
// Derived from I = |y0_n| × (deg+1) with per-model degree rules:
//   011  linear +1/step:      θ=20   → fires n=4 (seed=1.0), n=16 (seed=0.01)
//   I/1  log₂ degree:         θ=3200 → fires n=9 (seed=1.0), n=23 (seed=0.01)
//   j-2  log₂ degree:         θ=12   → birth constrained by |frontier|≥2
//                                       n=5 (seed=1.0), n=11 (seed=0.01)
//   F    log₂, half-y0:       θ varies by seed — see below

export const THETA_011  = 20
export const THETA_I1   = 3200
export const THETA_J2   = 12

// F threshold is calibrated per-seed because the log₂ degree + half-y0
// combination does not yield a single threshold satisfying both:
//   seed=1.0:  n=7  requires θ ∈ (112, 416]  → use 200
//   seed=0.01: n=21 requires θ ∈ (471, 1270] → use 600
export const THETA_F_CANONICAL = 200
export const THETA_F_GAME      = 600

// ── Default parameters ────────────────────────────────────────────────────────

export const DEFAULT_C          = 32
export const DEFAULT_M0         = 0.20
export const DEFAULT_ETA        = 0.20
export const DEFAULT_PREDATION  = 0.50

// ── Preset configurations ─────────────────────────────────────────────────────

export const CONFIG_CANONICAL: EcosystemConfig = {
  engine: SEED_CANONICAL,
  C: DEFAULT_C,
  dag: 'wide30',
  m0: DEFAULT_M0,
  thetaUncon011: THETA_011,
  thetaSeveranceI1: THETA_I1,
  thetaJ2: THETA_J2,
  thetaF: THETA_F_CANONICAL,
  predationStrength: DEFAULT_PREDATION,
  eta: DEFAULT_ETA,
  models: [
    { type: 'M011', entryNode: WIDE_011_ENTRY },
    { type: 'MF',   entryNode: WIDE_F_ENTRY   },
    { type: 'Mj2',  entryNode: WIDE_J2_ENTRY  },
    { type: 'MI1',  entryNode: WIDE_I1_ENTRY  },
  ],
}

export const CONFIG_GAME: EcosystemConfig = {
  ...CONFIG_CANONICAL,
  engine: SEED_GAME,
  thetaF: THETA_F_GAME,
}

export const CONFIG_GAME_COMPRESSED: EcosystemConfig = {
  ...CONFIG_GAME,
  dag: 'compressed16',
  models: [
    { type: 'M011', entryNode: 0 },
    { type: 'MF',   entryNode: 2 },
    { type: 'Mj2',  entryNode: 2 },
    { type: 'MI1',  entryNode: 4 },
  ],
}
