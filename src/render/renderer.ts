import type { DAGNode, EcosystemState } from '../types.js'
import type { LayoutMap } from './layout.js'
import type { ProbeState } from '../probe.js'
import type { NestedTaigaState } from '../nested/nestedTaiga.js'
import type { Particle } from './particles.js'
import { MODEL_PALETTE, EVENT_FLASH } from './palette.js'
import { nestedDensity } from '../nested/nestedTaiga.js'
import { density } from '../engine/substrate.js'

export interface FlashOverlay {
  nodeIds: number[]
  color:   string
  ttl:     number
  maxTtl:  number
}

export interface Shockwave {
  x:         number
  y:         number
  radius:    number
  maxRadius: number
  color:     string
  ttl:       number
  maxTtl:    number
}

export interface RenderState {
  ecosystemState: EcosystemState
  nodes:          DAGNode[]
  layout:         LayoutMap
  flashes:        FlashOverlay[]
  probe:          ProbeState
  isPaused:       boolean
  breathePhase:   number                   // sine phase for substrate pulse
  nestedTaigas:   NestedTaigaState[]
  edgeLuminosity: Map<string, number>      // 'fromId-toId' → 0..1 brightness
  shockwaves:     Shockwave[]
  particles:      Particle[]
}

const R_NODE     = 5
const R_FRONTIER = 7
const GLOW_BLUR  = 20

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  rs: RenderState,
): void {
  const { ecosystemState: es, nodes, layout, flashes, probe, isPaused } = rs
  const { width, height } = ctx.canvas

  // ── Background temperature — ρ drives colour continuously ───────────────────
  //
  // Cold (ρ=0): deep blue-black — universe empty, unconstrained.
  // Rising (ρ→0.5): deep violet, indigo — universe getting heavier.
  // Warm (ρ→1): amber darkness — full, compressed, about to end.

  const rho = density(es.substrate)

  ctx.fillStyle = bgColorFromRho(rho)
  ctx.fillRect(0, 0, width, height)

  // Ambient radial glow, temperature-matched
  if (rho > 0.01) {
    const glowIntensity = Math.min(rho * 0.55, 0.30)
    const [gr, gg, gb] = glowRgbFromRho(rho)
    const grad = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, Math.min(width, height) * 0.65,
    )
    grad.addColorStop(0, `rgba(${gr},${gg},${gb},${glowIntensity})`)
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)
  }

  // Substrate breathing — emerges above ρ=0.6, rate ∝ ρ
  if (rho > 0.6) {
    const depth = Math.min((rho - 0.6) / 0.4, 1) * 0.08
    const pulse = (Math.sin(rs.breathePhase) + 1) * 0.5
    ctx.fillStyle = `rgba(200,140,40,${(depth * pulse).toFixed(3)})`
    ctx.fillRect(0, 0, width, height)
  }

  // Per-node model lookups
  const visitedBy  = new Map<number, string>()
  const frontierOf = new Map<number, string>()
  for (const m of es.models.values()) {
    for (const nid of m.visited)  visitedBy.set(nid, m.type)
    for (const nid of m.frontier) frontierOf.set(nid, m.type)
  }

  // ── Edges — with record-flow luminosity ──────────────────────────────────────
  ctx.save()
  for (const node of nodes) {
    const from = layout.get(node.id)
    if (!from) continue
    for (const sid of node.successors) {
      const to = layout.get(sid)
      if (!to) continue
      const lum  = rs.edgeLuminosity.get(`${node.id}-${sid}`) ?? 0
      const lit  = visitedBy.has(node.id) && visitedBy.has(sid)
      const base = lit ? 0.22 : 0.06
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.9, base + lum * 0.55).toFixed(3)})`
      ctx.lineWidth   = lit ? 1.2 + lum * 1.2 : 0.7
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

  // ── Shockwaves ───────────────────────────────────────────────────────────────
  for (const sw of rs.shockwaves) {
    const alpha = (sw.ttl / sw.maxTtl) * 0.55
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = sw.color
    ctx.lineWidth   = 2.5
    ctx.beginPath()
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  // ── Particles ────────────────────────────────────────────────────────────────
  ctx.save()
  for (const p of rs.particles) {
    const alpha = (p.life / p.maxLife) * 0.75
    const size  = Math.max(0.3, p.size * (p.life / p.maxLife))
    ctx.globalAlpha = alpha
    ctx.fillStyle   = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // ── Dodecagons (nested Taigas) ────────────────────────────────────────────────
  for (const t of rs.nestedTaigas) drawDodecagon(ctx, t)

  // ── Probe ────────────────────────────────────────────────────────────────────
  drawProbe(ctx, probe, layout, width, rs.nestedTaigas)

  // ── Global HUD ───────────────────────────────────────────────────────────────
  drawHUD(ctx, es, isPaused, height)
}

// ── Dodecagon (nested Taiga) rendering ───────────────────────────────────────

const DODEC_R    = 24   // outer dodecagon radius
const DODEC_SIDES = 12

function dodecagonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath()
  for (let i = 0; i <= DODEC_SIDES; i++) {
    const angle = (i / DODEC_SIDES) * Math.PI * 2 - Math.PI / 2
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
}

function drawDodecagon(ctx: CanvasRenderingContext2D, t: NestedTaigaState): void {
  const eased = easeOut(t.birthAnim)
  const r     = DODEC_R * eased
  if (r < 0.5) return

  const { x, y, accent, innerAngle, innerFlashTtl, daughters } = t
  const nd = nestedDensity(t)

  ctx.save()

  // Outer dodecagon stroke
  ctx.strokeStyle = accent
  ctx.lineWidth   = 1.5
  ctx.globalAlpha = 0.82
  dodecagonPath(ctx, x, y, r)
  ctx.stroke()

  // Dark interior fill
  ctx.fillStyle = 'rgba(4,4,16,0.72)'
  dodecagonPath(ctx, x, y, r)
  ctx.fill()

  // Inner rotating triangle — rate ∝ internal ρ
  const innerR = r * 0.44
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(innerAngle)
  ctx.strokeStyle = accent
  ctx.lineWidth   = 1
  ctx.globalAlpha = innerFlashTtl > 0
    ? 0.9
    : 0.38 + nd * 0.45
  if (innerFlashTtl > 0) {
    ctx.fillStyle = accent
    ctx.globalAlpha = (innerFlashTtl / 25) * 0.35
    ctx.beginPath()
    for (let i = 0; i <= 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2
      if (i === 0) ctx.moveTo(innerR * Math.cos(a), innerR * Math.sin(a))
      else ctx.lineTo(innerR * Math.cos(a), innerR * Math.sin(a))
    }
    ctx.fill()
    ctx.globalAlpha = 0.9
  }
  ctx.beginPath()
  for (let i = 0; i <= 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2
    if (i === 0) ctx.moveTo(innerR * Math.cos(a), innerR * Math.sin(a))
    else ctx.lineTo(innerR * Math.cos(a), innerR * Math.sin(a))
  }
  ctx.stroke()
  ctx.restore()

  // Greek letter — centred
  ctx.font        = `bold ${Math.round(r * 0.55)}px sans-serif`
  ctx.fillStyle   = accent
  ctx.globalAlpha = 0.92
  ctx.textAlign   = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(t.id, x, y + 1)

  // Daughter count badge (bottom of dodecagon)
  if (daughters.length > 0) {
    ctx.font        = `bold 9px "Courier New", monospace`
    ctx.globalAlpha = 0.65
    ctx.fillText(`×${daughters.length}`, x, y + r + 10)
  }

  ctx.restore()
}

function easeOut(t: number): number { return 1 - (1 - t) * (1 - t) }

// ── Probe rendering ───────────────────────────────────────────────────────────

function drawProbe(
  ctx:          CanvasRenderingContext2D,
  probe:        ProbeState,
  layout:       LayoutMap,
  canvasW:      number,
  nestedTaigas: NestedTaigaState[],
): void {
  const pos = layout.get(probe.nodeId)
  if (!pos) return

  // White crosshair ring
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.92)'
  ctx.lineWidth   = 1.8
  ctx.beginPath()
  ctx.arc(pos.x, pos.y, R_FRONTIER + 4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.beginPath()
  ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Sense panel — flip side based on canvas position
  const panelW = 194
  const panelX = pos.x > canvasW / 2 ? pos.x - panelW - 20 : pos.x + 20
  drawSensePanel(ctx, probe, panelX, pos.y - 10, nestedTaigas)
}

const PANEL_LINE = 17
const PANEL_PAD  = 10

function drawSensePanel(
  ctx:          CanvasRenderingContext2D,
  probe:        ProbeState,
  px:           number,
  py:           number,
  nestedTaigas: NestedTaigaState[],
): void {
  const { sense } = probe
  type Line = { text: string; color: string }
  const lines: Line[] = []

  lines.push({ text: `node ${probe.nodeId}`, color: '#ccccee' })
  lines.push({ text: '', color: '' })

  // Local density bar
  const barLen = 8
  const filled = Math.round(Math.min(sense.localDensity, 1) * barLen)
  const bar    = '█'.repeat(filled) + '░'.repeat(barLen - filled)
  lines.push({ text: `ρ  ${bar}  ${sense.localDensity.toFixed(3)}`, color: '#aab8dd' })
  lines.push({ text: '', color: '' })

  // Frontier proximity
  if (sense.frontierProximity.length === 0) {
    lines.push({ text: 'frontier  —', color: '#7777aa' })
  } else {
    for (const fp of sense.frontierProximity) {
      const pal   = MODEL_PALETTE[fp.modelType]
      const label = fp.distance === 0 ? '[here]' : '[near]'
      lines.push({ text: `${fp.modelType}  ${label}`, color: pal.base })
    }
  }
  lines.push({ text: '', color: '' })

  // Local I
  const iStr = sense.localI > 0 ? sense.localI.toFixed(1) : '—'
  lines.push({ text: `I_local  ${iStr}`, color: '#ffcc55' })

  // Event flags
  if (sense.presentEvents.length > 0) {
    lines.push({ text: '', color: '' })
    for (const kind of sense.presentEvents) {
      const raw = EVENT_FLASH[kind] ?? 'rgba(255,255,255,0.9)'
      lines.push({ text: `⚡ ${kind}`, color: rgbaToSolid(raw) })
    }
  }

  // Nested Taigas whose birth node is at or adjacent to probe
  const nearbyTaigas = nestedTaigas.filter(
    t => t.birthNodeId === probe.nodeId || probe.predecessors.includes(t.birthNodeId) || probe.successors.includes(t.birthNodeId)
  )
  if (nearbyTaigas.length > 0) {
    lines.push({ text: '', color: '' })
    for (const t of nearbyTaigas) {
      const nd  = nestedDensity(t)
      const dgr = t.daughters.length > 0 ? t.daughters.map(d => d.id).join(' ') : '—'
      lines.push({ text: `[${t.id}] n=${t.simState.step}  ρ=${nd.toFixed(2)}`, color: t.accent })
      lines.push({ text: `   daughters: ${dgr}`, color: t.accent })
    }
  }

  // Navigation footer
  const atLeaf = probe.successors.length === 0
  if (atLeaf) {
    lines.push({ text: '', color: '' })
    lines.push({ text: '— end of path —', color: '#666688' })
  }

  // Background box
  const panelH = lines.length * PANEL_LINE + PANEL_PAD * 2
  ctx.save()
  ctx.fillStyle   = 'rgba(4, 4, 16, 0.84)'
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth   = 0.8
  ctx.beginPath()
  ctx.roundRect(px, py, 194, panelH, 4)
  ctx.fill()
  ctx.stroke()
  ctx.restore()

  // Text
  ctx.save()
  ctx.font        = 'bold 11px "Courier New", monospace'
  ctx.globalAlpha = 0.95
  let ty = py + PANEL_PAD + 11
  for (const line of lines) {
    if (!line.text) { ty += PANEL_LINE * 0.35; continue }
    ctx.fillStyle = line.color
    ctx.fillText(line.text, px + PANEL_PAD, ty)
    ty += PANEL_LINE
  }
  ctx.restore()
}

function rgbaToSolid(rgba: string): string {
  const m = rgba.match(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+)/)
  return m ? `rgb(${m[1]},${m[2]},${m[3]})` : rgba
}

// ── Background temperature helpers ────────────────────────────────────────────

function bgColorFromRho(rho: number): string {
  // Multi-stop RGB interpolation: cold blue-black → deep violet → indigo → amber darkness
  type Stop = [number, [number, number, number]]
  const stops: Stop[] = [
    [0.00, [6,   6,  18]],
    [0.35, [10,  7,  24]],
    [0.65, [14,  8,  20]],
    [0.85, [18,  9,  12]],
    [1.00, [26,  12,  4]],
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]!
    const [t1, c1] = stops[i + 1]!
    if (rho <= t1) {
      const t = (rho - t0) / (t1 - t0)
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * t)
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * t)
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * t)
      return `rgb(${r},${g},${b})`
    }
  }
  return 'rgb(26,12,4)'
}

function glowRgbFromRho(rho: number): [number, number, number] {
  // Cold glow: cool blue [20,20,80] → Warm glow: amber [80,40,10]
  return [
    Math.round(20 + rho * 60),
    Math.round(20 + rho * 20),
    Math.round(80 - rho * 70),
  ]
}

// ── Global HUD ────────────────────────────────────────────────────────────────

function drawHUD(
  ctx:      CanvasRenderingContext2D,
  es:       EcosystemState,
  isPaused: boolean,
  canvasH:  number,
): void {
  ctx.save()
  ctx.font        = 'bold 13px "Courier New", monospace'
  ctx.globalAlpha = 0.95

  let y = 24
  const x     = 16
  const lineH = 19

  // Step + run state
  let statusTag: string
  if (!es.running)       statusTag = '  [done]'
  else if (isPaused)     statusTag = '  [paused]'
  else                   statusTag = '  [playing]'

  ctx.fillStyle = '#ffffff'
  ctx.fillText(`n = ${es.step}${statusTag}`, x, y)
  y += lineH + 6

  // Per-model status
  for (const m of es.models.values()) {
    const pal = MODEL_PALETTE[m.type]
    if (m.active) {
      ctx.globalAlpha = 0.95
      ctx.fillStyle   = pal.base
      ctx.fillText(`${m.type}  I=${m.I.toFixed(1)}  deg=${m.degree}`, x, y)
    } else {
      ctx.globalAlpha = 0.5
      ctx.fillStyle   = pal.base
      ctx.fillText(`${m.type}  ${m.terminationMode ?? '?'} @ n=${m.terminationStep}`, x, y)
      ctx.globalAlpha = 0.95
    }
    y += lineH
  }

  // Substrate
  y += 6
  const d = density(es.substrate)
  ctx.fillStyle = '#aabbdd'
  ctx.fillText(
    `substrate  L=${es.substrate.records.length}  ρ=${d.toFixed(3)}  merges=${es.substrate.mergeCount}`,
    x, y,
  )

  // Key hints
  ctx.font        = 'bold 11px "Courier New", monospace'
  ctx.globalAlpha = 0.42
  ctx.fillStyle   = '#ffffff'
  ctx.fillText('SPC step  TAB step back  P play/pause  ↑↓ probe  ←→ cluster  R restart', x, canvasH - 14)

  ctx.restore()
}
