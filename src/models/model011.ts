/**
 * Model-011 — The Hyper-Structure Wellspring
 *
 * Lock-down trigger (Chapter XIII canonical reference):
 *   Uncon when Δ=1 (even step) AND |frontier|=1 AND I ≥ θ_011
 *
 * Degree growth: linear +1 per step (Finding 7).
 * I = |y0_n| × (degree + 1)  (user-confirmed formula)
 */
import type { EngineStep, ModelState } from '../types.js'
import { computeI } from '../engine/recursion.js'
import { advanceFrontier } from '../engine/dag.js'
import type { DAGNode } from '../types.js'
import { terminateModel, updateVisited } from './base.js'

export interface Model011Result {
  model: ModelState
  fired: boolean
}

export function stepModel011(
  m: ModelState,
  eng: EngineStep,
  nodes: DAGNode[],
  theta: number,
): Model011Result {
  if (!m.active) return { model: m, fired: false }

  // Advance frontier before trigger check (frontier state at this step)
  const newFrontier = advanceFrontier(m.frontier, nodes)

  // Degree update: linear +1 per step
  const newDegree = m.degree + 1

  // Trigger-check I at this step
  const I = computeI(eng, newDegree)

  // Lock-down trigger: Δ=1 AND |frontier|=1 AND I ≥ θ
  const fired =
    eng.delta === 1 &&
    newFrontier.length === 1 &&
    I >= theta

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
