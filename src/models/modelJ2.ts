/**
 * Model-01-j-2 — The Dimensional Architect
 *
 * Lock-down trigger (Chapter XIII canonical reference):
 *   Module birth when ∇=1 (odd step) AND |frontier| ≥ 2 AND I ≥ θ_J2
 *
 * Degree growth: nonlinear log₂(I) scaling (Finding 29).
 *   Δdegree = floor(log₂(max(I_prev, 2)))   ← uses previous step's I
 *
 * Diagnostic: I-spike without spatial expansion.  Module birth seeds a nested
 * Taiga with m = 1.0000 >> ρ_min (Finding 20).
 */
import type { EngineStep, ModelState } from '../types.js'
import { computeI, logDegreeIncrement } from '../engine/recursion.js'
import { advanceFrontier } from '../engine/dag.js'
import type { DAGNode } from '../types.js'
import { terminateModel, updateVisited } from './base.js'

export interface ModelJ2Result {
  model: ModelState
  fired: boolean
  moduleSeedI?: number   // I value at Module birth (Finding 19/20)
}

export function stepModelJ2(
  m: ModelState,
  eng: EngineStep,
  nodes: DAGNode[],
  theta: number,
): ModelJ2Result {
  if (!m.active) return { model: m, fired: false }

  const newFrontier = advanceFrontier(m.frontier, nodes)

  // Log₂ degree growth uses previous step's I (causal: last committed I)
  const degIncrement = logDegreeIncrement(m.I)
  const newDegree    = m.degree + degIncrement

  const I = computeI(eng, newDegree)

  // Lock-down trigger: ∇=1 AND |frontier| ≥ 2 AND I ≥ θ_J2
  const fired =
    eng.nabla === 1 &&
    newFrontier.length >= 2 &&
    I >= theta

  const updated: ModelState = updateVisited({
    ...m,
    frontier: newFrontier,
    degree: newDegree,
    I,
    step: m.step + 1,
  })

  if (fired) {
    return {
      model: terminateModel(updated, 'ModuleBirth'),
      fired: true,
      moduleSeedI: I,
    }
  }
  return { model: updated, fired: false }
}
