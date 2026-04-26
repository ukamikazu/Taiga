import type { EngineConfig, EngineStep } from '../types.js'

/**
 * Parity indicators for step n.
 * Δn = 1 (n even), ∇n = 1 − Δn  (Equations 1–2)
 */
export function parity(n: number): { delta: 0 | 1; nabla: 0 | 1 } {
  const delta = (n % 2 === 0 ? 1 : 0) as 0 | 1
  return { delta, nabla: (1 - delta) as 0 | 1 }
}

/**
 * Closed-form recursion engine at step n.  (Equations 35–36)
 *
 * y_{0,n} = 2^{(n + ∇n)/2} · [y_{0,0} + ∇n · y_{1,0}]
 * y_{1,n} = 2^{(n + ∇n)/2} · [Δn  · y_{0,0} − y_{1,0}]
 *
 * Amplitude doubles every two steps; odd steps mix both initial conditions,
 * even steps scale y_{0,0} alone.
 */
export function engineStep(cfg: EngineConfig, n: number): EngineStep {
  const { delta, nabla } = parity(n)
  const amp = Math.pow(2, (n + nabla) / 2)
  const y0  = amp * (cfg.y00 + nabla * cfg.y10)
  const y1  = amp * (delta * cfg.y00 - cfg.y10)
  return { n, y0, y1, delta, nabla }
}

/**
 * Trigger-check information functional.  I = |y0_n| × (degree + 1)
 *
 * Instantaneous: evaluated at the current step for trigger comparisons.
 * degree is the model's accumulated Int degree at this step.
 */
export function computeI(step: EngineStep, degree: number): number {
  return Math.abs(step.y0) * (degree + 1)
}

/**
 * Degree increment for models with log₂(I) nonlinear growth.
 * Uses previous step's I to keep update causal.
 * floor(log₂(max(I, 2))) guarantees minimum increment of 1.
 */
export function logDegreeIncrement(prevI: number): number {
  return Math.floor(Math.log2(Math.max(prevI, 2)))
}
