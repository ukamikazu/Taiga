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
  nodeId:       number
  sense:        ProbeSense
  successors:   number[]   // valid forward moves
  predecessors: number[]   // valid backward moves
}

const NULL_SENSE: ProbeSense = {
  localDensity: 0,
  frontierProximity: [],
  localI: 0,
  presentEvents: [],
}

export function makeProbe(entryNode: number): ProbeState {
  return { nodeId: entryNode, sense: NULL_SENSE, successors: [], predecessors: [] }
}

/** Recompute sense + navigation options. Non-mutating. */
export function refreshProbe(
  probe: ProbeState,
  es:    EcosystemState,
  nodes: DAGNode[],
): ProbeState {
  const node = nodes[probe.nodeId]
  return {
    ...probe,
    sense:        computeSense(probe.nodeId, es, nodes),
    successors:   node?.successors.slice()   ?? [],
    predecessors: node?.predecessors.slice() ?? [],
  }
}

/** Move forward to a successor. Returns null if targetId is not a valid forward edge. */
export function moveProbe(
  probe:    ProbeState,
  targetId: number,
  es:       EcosystemState,
  nodes:    DAGNode[],
): ProbeState | null {
  if (!probe.successors.includes(targetId)) return null
  return refreshProbe({ ...probe, nodeId: targetId }, es, nodes)
}

/** Move backward to a predecessor. Returns null if already at an entry node. */
export function moveProbeBack(
  probe: ProbeState,
  es:    EcosystemState,
  nodes: DAGNode[],
): ProbeState | null {
  if (probe.predecessors.length === 0) return null
  const targetId = probe.predecessors[0]!  // first predecessor (deterministic)
  return refreshProbe({ ...probe, nodeId: targetId }, es, nodes)
}

/** Teleport to any node (cross-cluster lateral jump). Not constrained to edges. */
export function jumpProbe(
  probe:    ProbeState,
  targetId: number,
  es:       EcosystemState,
  nodes:    DAGNode[],
): ProbeState {
  return refreshProbe({ ...probe, nodeId: targetId }, es, nodes)
}

// ── Sense computation ─────────────────────────────────────────────────────────

function computeSense(
  nodeId: number,
  es:     EcosystemState,
  nodes:  DAGNode[],
): ProbeSense {
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

  const presentEvents: EventKind[] = []
  for (const ev of es.events) {
    if (ev.step !== es.step) continue
    const model = es.models.get(ev.modelId)
    if (!model) continue
    if (model.frontier.includes(nodeId)) presentEvents.push(ev.kind)
  }

  return { localDensity, frontierProximity, localI, presentEvents }
}

function isAdjacentTo(node: DAGNode, frontierSet: Set<number>): boolean {
  for (const s of node.successors)   if (frontierSet.has(s)) return true
  for (const p of node.predecessors) if (frontierSet.has(p)) return true
  return false
}
