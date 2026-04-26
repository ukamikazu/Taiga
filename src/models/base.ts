import type { ModelState, ModelType, TerminationMode } from '../types.js'

export function makeModel(
  id: string,
  type: ModelType,
  entryNode: number,
): ModelState {
  return {
    id,
    type,
    entryNode,
    frontier: [entryNode],
    visited: [entryNode],
    degree: 0,
    I: 0,
    step: 0,
    active: true,
    terminationStep: null,
    terminationMode: null,
  }
}

export function terminateModel(
  m: ModelState,
  mode: TerminationMode,
): ModelState {
  return {
    ...m,
    active: false,
    terminationStep: m.step,
    terminationMode: mode,
  }
}

/** Update visited to include any newly reached frontier nodes. */
export function updateVisited(m: ModelState): ModelState {
  const v = new Set(m.visited)
  for (const id of m.frontier) v.add(id)
  return { ...m, visited: [...v] }
}
