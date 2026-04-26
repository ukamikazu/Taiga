import type { DAGNode, EcosystemState } from '../types.js'
import type { LayoutMap } from './layout.js'
import type { ProbeState } from '../probe.js'
import { MODEL_PALETTE, EVENT_FLASH } from './palette.js'
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
  probe:          ProbeState
}

const R_NODE     = 5
const R_FRONTIER = 7
const GLOW_BLUR  = 20

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  rs: RenderState,
): void {
  const { ecosystemState: es, nodes, layout, flashes, probe } = rs
  const { width, height } = ctx.canvas

  // Background — darkens / lightens with global substrate density
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

  // Per-node model lookups
  const visitedBy  = new Map<number, string>()
  const frontierOf = new Map<number, string>()
  for (const m of es.models.values()) {
    for (const nid of m.visited)  visitedBy.set(nid, m.type)
    for (const nid of m.frontier) frontierOf.set(nid, m.type)
  }

  // ── Edges ────────────────────────────────────────────────────────────────────
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

  // ── Nodes ────────────────────────────────────────────────────────────────────
  for (const node of nodes) {
    const pos = layout.get(node.id)
    if (!pos) continue

    const fModel = frontierOf.get(node.id)
    const vModel = visitedBy.get(node.id)

    if (fModel) {
      const pal = MODEL_PALETTE[fModel as keyof typeof MODEL_PALETTE]
      if (!pal) continue
      ctx.save()
      ctx.shadowBlur  = GLOW_BLUR
      ctx.shadowColor = pal.glow
      ctx.fillStyle   = pal.base
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, R_FRONTIER, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      ctx.save()
      ctx.strokeStyle = pal.base
      ctx.lineWidth   = 1.5
      ctx.globalAlpha = 0.45
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

  // ── Flash overlays ───────────────────────────────────────────────────────────
  for (const flash of flashes) {
    const alpha  = flash.ttl / flash.maxTtl
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

  // ── Probe marker + sense panel ───────────────────────────────────────────────
  drawProbe(ctx, probe, layout, width)

  // ── Global HUD ───────────────────────────────────────────────────────────────
  drawHUD(ctx, es)
}

// ── Probe ─────────────────────────────────────────────────────────────────────

function drawProbe(
  ctx:    CanvasRenderingContext2D,
  probe:  ProbeState,
  layout: LayoutMap,
  canvasW: number,
): void {
  const pos = layout.get(probe.nodeId)
  if (!pos) return

  // White crosshair ring at probe location
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth   = 1.5
  ctx.beginPath()
  ctx.arc(pos.x, pos.y, R_FRONTIER + 4, 0, Math.PI * 2)
  ctx.stroke()
  // Small inner dot
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.beginPath()
  ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Sense panel — offset left if probe is in right half of canvas
  const panelW  = 180
  const panelX  = pos.x > canvasW / 2 ? pos.x - panelW - 18 : pos.x + 18
  drawSensePanel(ctx, probe, panelX, pos.y - 10)
}

const PANEL_LINE = 15
const PANEL_PAD  = 9

function drawSensePanel(
  ctx:    CanvasRenderingContext2D,
  probe:  ProbeState,
  px:     number,
  py:     number,
): void {
  const { sense } = probe
  const lines: Array<{ text: string; color: string; alpha?: number }> = []

  lines.push({ text: `node ${probe.nodeId}`, color: '#aaaacc' })
  lines.push({ text: '', color: '#000' })

  // Local density bar (8 segments)
  const barLen  = 8
  const filled  = Math.round(Math.min(sense.localDensity, 1) * barLen)
  const bar     = '█'.repeat(filled) + '░'.repeat(barLen - filled)
  const rhoVal  = sense.localDensity.toFixed(3)
  lines.push({ text: `ρ  ${bar}  ${rhoVal}`, color: '#8888bb' })
  lines.push({ text: '', color: '#000' })

  // Frontier proximity
  if (sense.frontierProximity.length === 0) {
    lines.push({ text: 'frontier  —', color: '#444466' })
  } else {
    for (const fp of sense.frontierProximity) {
      const pal   = MODEL_PALETTE[fp.modelType]
      const label = fp.distance === 0 ? '[here]' : '[near]'
      lines.push({ text: `${fp.modelType}  ${label}`, color: pal.base })
    }
  }
  lines.push({ text: '', color: '#000' })

  // Local I
  const iStr = sense.localI > 0 ? sense.localI.toFixed(1) : '—'
  lines.push({ text: `I_local  ${iStr}`, color: '#ccaa44' })

  // Events
  if (sense.presentEvents.length > 0) {
    lines.push({ text: '', color: '#000' })
    for (const kind of sense.presentEvents) {
      const color = EVENT_FLASH[kind] ?? 'rgba(255,255,255,0.9)'
      lines.push({ text: `⚡ ${kind}`, color })
    }
  }

  // Panel background
  const panelH = lines.length * PANEL_LINE + PANEL_PAD * 2
  ctx.save()
  ctx.fillStyle   = 'rgba(4, 4, 14, 0.82)'
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth   = 0.8
  ctx.beginPath()
  ctx.roundRect(px, py, 180, panelH, 4)
  ctx.fill()
  ctx.stroke()
  ctx.restore()

  // Panel text
  ctx.save()
  ctx.font        = '10px "Courier New", monospace'
  ctx.globalAlpha = 0.9
  let ty = py + PANEL_PAD + 10
  for (const line of lines) {
    if (line.text === '') { ty += PANEL_LINE * 0.4; continue }
    // Strip rgba/color alpha so we can use it for fillStyle
    ctx.fillStyle = line.color.startsWith('rgba') ? extractSolidColor(line.color) : line.color
    ctx.fillText(line.text, px + PANEL_PAD, ty)
    ty += PANEL_LINE
  }
  ctx.restore()
}

/** Convert rgba(...) string to a visible solid color for canvas fillStyle. */
function extractSolidColor(rgba: string): string {
  const m = rgba.match(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return rgba
  return `rgb(${m[1]},${m[2]},${m[3]})`
}

// ── Global HUD ────────────────────────────────────────────────────────────────

function drawHUD(ctx: CanvasRenderingContext2D, es: EcosystemState): void {
  ctx.save()
  ctx.font        = '11px "Courier New", monospace'
  ctx.globalAlpha = 0.78

  let y = 22
  const x     = 14
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
      ctx.globalAlpha = 0.42
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

  // Key hints at bottom-left
  const { height } = ctx.canvas
  ctx.globalAlpha = 0.35
  ctx.fillStyle   = '#ffffff'
  ctx.fillText('SPC/↓ advance  ←/→ branch  TAB jump cluster  R restart', x, height - 12)

  ctx.restore()
}
