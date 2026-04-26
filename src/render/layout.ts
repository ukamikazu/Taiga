import type { DAGTopology } from '../types.js'

export interface NodeLayout { x: number; y: number }
export type LayoutMap = Map<number, NodeLayout>

export function layoutDAG(topology: DAGTopology, w: number, h: number): LayoutMap {
  return topology === 'wide30' ? layoutWide(w, h) : layoutCompressed(w, h)
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

function layoutWide(w: number, h: number): LayoutMap {
  const map = new Map<number, NodeLayout>()
  const yTop = h * 0.06
  const yBot = h * 0.94

  // 011 cluster: 20 nodes, linear, x=12%
  const x011 = w * 0.12
  for (let i = 0; i < 20; i++) map.set(i, { x: x011, y: lerp(yTop, yBot, i / 19) })

  // F cluster: 20 nodes, linear, x=35%
  const xF = w * 0.35
  for (let i = 0; i < 20; i++) map.set(20 + i, { x: xF, y: lerp(yTop, yBot, i / 19) })

  // j-2 cluster: 20 nodes, branching, centred at x=62%
  const xJ2c = w * 0.62
  const xJ2L = w * 0.56
  const xJ2R = w * 0.68
  const branchFrac = 0.44   // y-fraction for branch node 44
  const joinFrac   = 0.94   // y-fraction for join node 59

  // Pre-branch nodes 40–44 at centre
  for (let i = 0; i <= 4; i++) {
    map.set(40 + i, { x: xJ2c, y: lerp(yTop, yBot, lerp(0, branchFrac, i / 4)) })
  }
  // Left arm: 45, 47, 49, 51, 53, 55, 57
  const armA = [45, 47, 49, 51, 53, 55, 57]
  const armB = [46, 48, 50, 52, 54, 56, 58]
  for (let i = 0; i < 7; i++) {
    const frac = lerp(branchFrac, joinFrac, (i + 1) / 8)
    map.set(armA[i]!, { x: xJ2L, y: lerp(yTop, yBot, frac) })
    map.set(armB[i]!, { x: xJ2R, y: lerp(yTop, yBot, frac) })
  }
  // Join node 59
  map.set(59, { x: xJ2c, y: lerp(yTop, yBot, joinFrac) })

  // I/1 cluster: 30 nodes, linear, x=88%
  const xI1 = w * 0.88
  for (let i = 0; i < 30; i++) map.set(60 + i, { x: xI1, y: lerp(yTop, yBot, i / 29) })

  return map
}

function layoutCompressed(w: number, h: number): LayoutMap {
  const map = new Map<number, NodeLayout>()
  const cx   = w / 2
  const yTop = h * 0.06
  const yBot = h * 0.94

  // Linear trunk 0–7 at centre
  for (let i = 0; i <= 7; i++) map.set(i, { x: cx, y: lerp(yTop, yBot, i / 14) })

  // Branch: left (8,10,12) and right (9,11,13)
  const armFracs = [8 / 14, 9 / 14, 10 / 14]
  const leftX  = cx - w * 0.13
  const rightX = cx + w * 0.13
  for (let i = 0; i < 3; i++) {
    map.set(8  + i * 2, { x: leftX,  y: lerp(yTop, yBot, armFracs[i]!) })
    map.set(9  + i * 2, { x: rightX, y: lerp(yTop, yBot, armFracs[i]!) })
  }
  // Join 14, tail 15
  map.set(14, { x: cx, y: lerp(yTop, yBot, 11 / 14) })
  map.set(15, { x: cx, y: lerp(yTop, yBot, 13 / 14) })

  return map
}
