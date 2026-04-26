import type { DAGNode, EcosystemState } from '../types.js'
import type { LayoutMap } from './layout.js'
import { MODEL_PALETTE } from './palette.js'
import { density } from '../engine/substrate.js'

export interface FlashOverlay {
  nodeIds: number[]
  color:   string
  ttl:     number
  maxTtl:  number
}

export interface RenderState {
  ecosystemState: EcosystemState
  nodes:          DAGNode[]
  layout:         LayoutMap
  flashes:        FlashOverlay[]
}

const R_NODE     = 5
const R_FRONTIER = 7
const GLOW_BLUR  = 20

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  rs: RenderState,
): void {
  const { ecosystemState: es, nodes, layout, flashes } = rs
  const { width, height } = ctx.canvas

  // Background with density-driven ambient
  ctx.fillStyle = '#08080f'
  ctx.fillRect(0, 0, width, height)

  const d = density(es.substrate)
  if (d > 0.01) {
    const intensity = Math.min(d * 0.5, 0.28)
    const grad = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, Math.min(width, height) * 0.65,
    )
    grad.addColorStop(0, `rgba(30, 30, 80, ${intensity})`)
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)
  }

  // Build per-node model lookups
  const visitedBy  = new Map<number, string>()  // nodeId → modelType (last writer wins)
  const frontierOf = new Map<number, string>()  // nodeId → modelType
  for (const m of es.models.values()) {
    for (const nid of m.visited)  visitedBy.set(nid, m.type)
    for (const nid of m.frontier) frontierOf.set(nid, m.type)
  }

  // Edges
  ctx.save()
  for (const node of nodes) {
    const from = layout.get(node.id)
    if (!from) continue
    for (const sid of node.successors) {
      const to = layout.get(sid)
      if (!to) continue
      const lit = visitedBy.has(node.id) && visitedBy.has(sid)
      ctx.strokeStyle = lit ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)'
      ctx.lineWidth   = lit ? 1.2 : 0.7
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    }
  }
  ctx.restore()

  // Nodes
  for (const node of nodes) {
    const pos = layout.get(node.id)
    if (!pos) continue

    const fModel = frontierOf.get(node.id)
    const vModel = visitedBy.get(node.id)

    if (fModel) {
      const pal = MODEL_PALETTE[fModel as keyof typeof MODEL_PALETTE]
      if (!pal) continue
      // Glow fill
      ctx.save()
      ctx.shadowBlur  = GLOW_BLUR
      ctx.shadowColor = pal.glow
      ctx.fillStyle   = pal.base
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, R_FRONTIER, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      // Outer pulse ring
      ctx.save()
      ctx.strokeStyle  = pal.base
      ctx.lineWidth    = 1.5
      ctx.globalAlpha  = 0.45
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, R_FRONTIER + 6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    } else if (vModel) {
      const pal = MODEL_PALETTE[vModel as keyof typeof MODEL_PALETTE]
      if (!pal) continue
      ctx.fillStyle = pal.visited
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, R_NODE, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.save()
      ctx.fillStyle   = 'rgba(255,255,255,0.05)'
      ctx.strokeStyle = 'rgba(255,255,255,0.11)'
      ctx.lineWidth   = 0.8
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, R_NODE, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  }

  // Flash overlays — expand + fade rings
  for (const flash of flashes) {
    const alpha = flash.ttl / flash.maxTtl
    const expand = R_FRONTIER + 18 * (1 - alpha)
    ctx.save()
    ctx.globalAlpha = alpha * 0.9
    ctx.strokeStyle = flash.color
    ctx.lineWidth   = 2.5
    for (const nid of flash.nodeIds) {
      const pos = layout.get(nid)
      if (!pos) continue
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, expand, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  // HUD
  drawHUD(ctx, es)
}

function drawHUD(ctx: CanvasRenderingContext2D, es: EcosystemState): void {
  ctx.save()
  ctx.font        = '11px "Courier New", monospace'
  ctx.globalAlpha = 0.78

  let y = 22
  const x    = 14
  const lineH = 16

  ctx.fillStyle = '#ffffff'
  ctx.fillText(`n = ${es.step}${es.running ? '' : '  [done]'}`, x, y)
  y += lineH + 6

  for (const m of es.models.values()) {
    const pal = MODEL_PALETTE[m.type]
    ctx.fillStyle = pal.base
    if (m.active) {
      ctx.fillText(`${m.type}  I=${m.I.toFixed(1)}  deg=${m.degree}`, x, y)
    } else {
      ctx.globalAlpha = 0.45
      ctx.fillText(`${m.type}  ${m.terminationMode ?? '?'} @ n=${m.terminationStep}`, x, y)
      ctx.globalAlpha = 0.78
    }
    y += lineH
  }

  y += 8
  const d = density(es.substrate)
  ctx.fillStyle = '#8888bb'
  ctx.fillText(
    `substrate  L=${es.substrate.records.length}  ρ=${d.toFixed(3)}  merges=${es.substrate.mergeCount}`,
    x, y,
  )

  ctx.restore()
}
