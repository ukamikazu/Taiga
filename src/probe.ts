import type { DAGNode, EcosystemState, EventKind, ModelType } from './types.js'

export interface FrontierProximity {
  modelId:   string
  modelType: ModelType
  distance:  0 | 1   // 0 = on frontier, 1 = adjacent (one DAG edge away)
}

export interface ProbeSense {
  localDensity:      number               // records at probe node / C
  frontierProximity: FrontierProximity[]
  localI:            number               // sum of I from models at distance 0 or 1
  presentEvents:     EventKind[]          // event kinds that fired at probe node this step
}

export interface ProbeState {
  nodeId:     number
  sense:      ProbeSense
  successors: number[]   // valid forward moves from current position
}

const NULL_SENSE: ProbeSense = {
  localDensity: 0,
  frontierProximity: [],
  localI: 0,
  presentEvents: [],
}

export function makeProbe(entryNode: number): ProbeState {
  return { nodeId: entryNode, sense: NULL_SENSE, successors: [] }
}

/** Recompute sense + successors from the current ecosystem state. Non-mutating. */
export function refreshProbe(
  probe: ProbeState,
  es:    EcosystemState,
  nodes: DAGNode[],
): ProbeState {
  return {
    ...probe,
    sense:      computeSense(probe.nodeId, es, nodes),
    successors: nodes[probe.nodeId]?.successors.slice() ?? [],
  }
}

/**
 * Move probe forward to targetId.  Returns updated probe if targetId is a
 * valid successor; returns null if the move is illegal (not a forward edge).
 * The probe is massless — no substrate writes occur.
 */
export function moveProbe(
  probe:    ProbeState,
  targetId: number,
  es:       EcosystemState,
  nodes:    DAGNode[],
): ProbeState | null {
  if (!probe.successors.includes(targetId)) return null
  return refreshProbe({ ...probe, nodeId: targetId }, es, nodes)
}

/** Teleport to any entry node (Tab / cluster jump).  Not a DAG edge. */
export function jumpProbe(
  probe:     ProbeState,
  entryNode: number,
  es:        EcosystemState,
  nodes:     DAGNode[],
): ProbeState {
  return refreshProbe({ ...probe, nodeId: entryNode }, es, nodes)
}

// ── Sense computation ─────────────────────────────────────────────────────────

function computeSense(
  nodeId: number,
  es:     EcosystemState,
  nodes:  DAGNode[],
): ProbeSense {
  // Local substrate density: records referencing this node / capacity
  const recordsHere = es.substrate.records.filter(r => r.nodeId === nodeId).length
  const localDensity = recordsHere / es.substrate.C

  const probeNode = nodes[nodeId]
  const frontierProximity: FrontierProximity[] = []
  let localI = 0

  for (const m of es.models.values()) {
    if (!m.active) continue
    const frontierSet = new Set(m.frontier)

    let distance: 0 | 1 | null = null
    if (frontierSet.has(nodeId)) {
      distance = 0
    } else if (probeNode && isAdjacentTo(probeNode, frontierSet)) {
      distance = 1
    }

    if (distance !== null) {
      frontierProximity.push({ modelId: m.id, modelType: m.type, distance })
      localI += m.I
    }
  }

  // Events that fired at this node during the current step
  const presentEvents: EventKind[] = []
  for (const ev of es.events) {
    if (ev.step !== es.step) continue
    const model = es.models.get(ev.modelId)
    if (!model) continue
    // Match if the model's frontier (preserved even after termination) includes probe node
    if (model.frontier.includes(nodeId)) {
      presentEvents.push(ev.kind)
    }
  }

  return { localDensity, frontierProximity, localI, presentEvents }
}

function isAdjacentTo(node: DAGNode, frontierSet: Set<number>): boolean {
  for (const s of node.successors)   if (frontierSet.has(s)) return true
  for (const p of node.predecessors) if (frontierSet.has(p)) return true
  return false
}
