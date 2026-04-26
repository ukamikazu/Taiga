/**
 * Model-01-F — The Appendage Phase / Scavenger
 *
 * Half-engine-strength: I uses |y0_n| × 0.5 × (degree + 1).
 * Degree growth: nonlinear log₂(I) — same mechanism as j-2 and I/1.
 * Trigger: Uncon when I ≥ θ_F (simple threshold on even OR odd step;
 * F's single-appendage territory means |frontier|=1 always on its linear chain).
 *
 * θ_F is calibrated per-config:
 *   canonical seed (1.0): θ_F = 200  → fires at n=7
 *   game seed (0.01):     θ_F = 600  → fires at n=21
 */
import type { EngineStep, ModelState } from '../types.js'
import { logDegreeIncrement } from '../engine/recursion.js'
import { advanceFrontier } from '../engine/dag.js'
import type { DAGNode } from '../types.js'
import { terminateModel, updateVisited } from './base.js'

export interface ModelFResult {
  model: ModelState
  fired: boolean
}

export function stepModelF(
  m: ModelState,
  eng: EngineStep,
  nodes: DAGNode[],
  theta: number,
): ModelFResult {
  if (!m.active) return { model: m, fired: false }

  const newFrontier  = advanceFrontier(m.frontier, nodes)
  const degIncrement = logDegreeIncrement(m.I)
  const newDegree    = m.degree + degIncrement

  // Half-engine-strength: y0 contribution halved
  const I = Math.abs(eng.y0) * 0.5 * (newDegree + 1)

  const fired = I >= theta

  const updated: ModelState = updateVisited({
    ...m,
    frontier: newFrontier,
    degree: newDegree,
    I,
    step: m.step + 1,
  })

  if (fired) return { model: terminateModel(updated, 'Uncon'), fired: true }
  return { model: updated, fired: false }
}
