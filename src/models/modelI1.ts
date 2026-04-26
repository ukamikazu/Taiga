/**
 * Model-01-I/1 — The Stalker / Apex Predator
 *
 * Lock-down trigger (Chapter XIII canonical reference):
 *   Severance when I ≥ θ_I/1  (raw I threshold, no geometric gate)
 *
 * "The asymmetry from 011's geometric trigger is the basis of Finding 10
 *  (M00 density as selective pressure)."
 *
 * Degree growth: nonlinear log₂(I) scaling (Finding 7 — "For I/1, degree
 * growth is nonlinear (scales with log₂(I))").
 */
import type { EngineStep, ModelState } from '../types.js'
import { computeI, logDegreeIncrement } from '../engine/recursion.js'
import { advanceFrontier } from '../engine/dag.js'
import type { DAGNode } from '../types.js'
import { terminateModel, updateVisited } from './base.js'

export interface ModelI1Result {
  model: ModelState
  fired: boolean
}

export function stepModelI1(
  m: ModelState,
  eng: EngineStep,
  nodes: DAGNode[],
  theta: number,
): ModelI1Result {
  if (!m.active) return { model: m, fired: false }

  const newFrontier  = advanceFrontier(m.frontier, nodes)
  const degIncrement = logDegreeIncrement(m.I)
  const newDegree    = m.degree + degIncrement
  const I            = computeI(eng, newDegree)

  // Raw I threshold — no parity or frontier condition
  const fired = I >= theta

  const updated: ModelState = updateVisited({
    ...m,
    frontier: newFrontier,
    degree: newDegree,
    I,
    step: m.step + 1,
  })

  if (fired) return { model: terminateModel(updated, 'Severance'), fired: true }
  return { model: updated, fired: false }
}
