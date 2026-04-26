import type { DAGNode, DAGTopology } from '../types.js'

// ── Wide topology — isolated model clusters ───────────────────────────────────
//
// Finding 27: "I/1 and F remained in separate DAG clusters" — wide DAG has
// disconnected sub-graphs per model type.  Interaction is substrate-only.
//
//  011 cluster:  nodes  0– 19  — linear chain, leaf at 19
//  F   cluster:  nodes 20– 39  — linear chain, leaf at 39
//  j-2 cluster:  nodes 40– 59  — branching structure (see below)
//  I/1 cluster:  nodes 60– 89  — linear chain, leaf at 89
//
// j-2 cluster topology (20 nodes, 40–59):
//   Pre-branch linear: 40→41→42→43→44  (4 hops to branch node 44)
//   Branch at 44:      44→45, 44→46
//   Branch A:          45→47→49→51→53→55→57→59  (7 hops → join 59)
//   Branch B:          46→48→50→52→54→56→58→59  (7 hops → join 59)
//   Join / leaf:       59
//
// j-2 frontier timeline from entry 40:
//   n=0:{40} n=1:{41} n=2:{42} n=3:{43} n=4:{44}
//   n=5:{45,46}  ← first even bifurcation — wait, n=5 is ODD ✓
//   n=6:{47,48}  n=7:{49,50} ← odd ✓
//   n=8:{51,52}  n=9:{53,54} ← odd ✓
//   n=10:{55,56} n=11:{57,58} ← odd ✓  ← Module birth window at seed=0.01
//   n=12:{59}    ← join, even, |frontier|=1
//
// With I=|y0_n|×(deg+1) and log₂ degree growth:
//   seed=1.0 : I≥12 already by n=3; first odd |frontier|≥2 step is n=5 → birth@n=5
//   seed=0.01: I crosses 12 at n=11 (first odd |frontier|≥2 with I≥12)  → birth@n=11
//
// Model entry points (wide):
const WIDE_011_ENTRY = 0
const WIDE_F_ENTRY   = 20
const WIDE_J2_ENTRY  = 40
const WIDE_I1_ENTRY  = 60

export { WIDE_011_ENTRY, WIDE_F_ENTRY, WIDE_J2_ENTRY, WIDE_I1_ENTRY }

function buildWideEdges(): [number, number][] {
  const edges: [number, number][] = []

  // 011 cluster: linear 0-19
  for (let i = 0; i < 19; i++) edges.push([i, i + 1])

  // F cluster: linear 20-39
  for (let i = 20; i < 39; i++) edges.push([i, i + 1])

  // j-2 cluster: 40-59
  // pre-branch
  for (let i = 40; i < 44; i++) edges.push([i, i + 1])
  // branch at 44
  edges.push([44, 45], [44, 46])
  // branch A: 45→47→49→51→53→55→57→59
  for (let n = 45; n <= 57; n += 2) edges.push([n, n + 2])
  edges.push([57, 59])
  // branch B: 46→48→50→52→54→56→58→59
  for (let n = 46; n <= 58; n += 2) edges.push([n, n + 2])
  edges.push([58, 59])

  // I/1 cluster: linear 60-89
  for (let i = 60; i < 89; i++) edges.push([i, i + 1])

  return edges
}

// ── Compressed-16 topology ────────────────────────────────────────────────────
//
// Single connected component; all models share overlapping territory.
// Enables predation contacts (Finding 33: 10 contacts at seed=0.01).
//
//   Linear:    0→1→2→3→4→5→6→7
//   Branch:    7→8, 7→9
//   Branch A:  8→10→12→14
//   Branch B:  9→11→13→14  (join at 14)
//   Tail:      14→15
//
// Entry points:
//   011 at 0 · F at 2 · j-2 at 2 · I/1 at 4

const COMPRESSED16_EDGES: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],
  [7,8],[7,9],
  [8,10],[10,12],[12,14],
  [9,11],[11,13],[13,14],
  [14,15],
]

// ── DAG builder ───────────────────────────────────────────────────────────────

function buildFromEdges(
  nodeCount: number,
  edges: [number, number][],
): DAGNode[] {
  const nodes: DAGNode[] = Array.from({ length: nodeCount }, (_, i) => ({
    id: i,
    successors: [],
    predecessors: [],
  }))
  for (const [from, to] of edges) {
    const f = nodes[from]
    const t = nodes[to]
    if (!f || !t) throw new Error(`Edge [${from},${to}] out of range`)
    f.successors.push(to)
    t.predecessors.push(from)
  }
  return nodes
}

export function buildDAG(topology: DAGTopology): DAGNode[] {
  switch (topology) {
    case 'wide30':
      return buildFromEdges(90, buildWideEdges())
    case 'compressed16':
      return buildFromEdges(16, COMPRESSED16_EDGES)
  }
}

/**
 * Advance a frontier set one step through the DAG.
 * Leaf nodes (no successors) stay in the frontier — the model lingers there.
 */
export function advanceFrontier(
  frontier: number[],
  nodes: DAGNode[],
): number[] {
  const next = new Set<number>()
  for (const id of frontier) {
    const node = nodes[id]
    if (!node) continue
    if (node.successors.length === 0) {
      next.add(id)
    } else {
      for (const s of node.successors) next.add(s)
    }
  }
  return [...next]
}

export function frontiersOverlap(a: number[], b: number[]): boolean {
  const setA = new Set(a)
  return b.some(id => setA.has(id))
}
