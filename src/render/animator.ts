import type { EcosystemConfig, EcosystemState, EventKind } from '../types.js'
import { buildDAG } from '../engine/dag.js'
import { WIDE_J2_ENTRY } from '../engine/dag.js'
import { initEcosystem, tickEcosystem } from '../ecosystem.js'
import {
  makeProbe,
  refreshProbe,
  moveProbe,
  moveProbeBack,
  jumpProbe,
} from '../probe.js'
import { layoutDAG, type LayoutMap } from './layout.js'
import { EVENT_FLASH } from './palette.js'
import { type FlashOverlay, type RenderState, renderFrame } from './renderer.js'

export interface AnimatorOptions {
  config:          EcosystemConfig
  canvas:          HTMLCanvasElement
  tickIntervalMs?: number   // ms per tick in auto-play mode (default 600)
}

export interface Animator {
  start(): void
  stop():  void
  reset(): void
}

export function createAnimator(opts: AnimatorOptions): Animator {
  const { config, canvas } = opts
  const tickIntervalMs = opts.tickIntervalMs ?? 600

  const ctx   = canvas.getContext('2d')!
  const nodes = buildDAG(config.dag)

  let layout         = layoutDAG(config.dag, canvas.width, canvas.height)
  let columns        = buildColumns(layout)
  let ecosystemState = initEcosystem(config)
  let probe          = refreshProbe(makeProbe(WIDE_J2_ENTRY), ecosystemState, nodes)
  let history: EcosystemState[] = []   // snapshot stack for backward stepping
  let flashes: FlashOverlay[] = []
  let lastTickMs = 0
  let isPaused   = true   // start paused — player steps manually
  let rafId      = 0
  let active     = false

  // ── Ecosystem step ─────────────────────────────────────────────────────────

  function stepEcosystem(): void {
    if (!ecosystemState.running) return
    history.push(ecosystemState)        // snapshot before advancing
    ecosystemState = tickEcosystem(ecosystemState, config)

    probe = refreshProbe(probe, ecosystemState, nodes)

    for (const ev of ecosystemState.events) {
      if (ev.step !== ecosystemState.step) continue
      const color = EVENT_FLASH[ev.kind as EventKind] ?? 'rgba(255,255,255,0.8)'
      if (ev.kind === 'ModelStep') continue

      let nodeIds: number[]
      if (ev.kind === 'SubstrateMerge') {
        const all: number[] = []
        for (const m of ecosystemState.models.values()) all.push(...m.visited)
        nodeIds = [...new Set(all)]
      } else {
        const model = ecosystemState.models.get(ev.modelId)
        nodeIds = model ? [...model.frontier] : []
      }
      if (nodeIds.length > 0) flashes.push({ nodeIds, color, ttl: 14, maxTtl: 14 })
    }
  }

  // ── Lateral (←/→) navigation via layout columns ───────────────────────────

  function moveLateral(direction: -1 | 1): void {
    const probePos = layout.get(probe.nodeId)
    if (!probePos) return

    const currentColIdx = columns.findIndex(col => col.includes(probe.nodeId))
    if (currentColIdx === -1) return

    const nextColIdx = currentColIdx + direction
    if (nextColIdx < 0 || nextColIdx >= columns.length) return  // hard border

    const col       = columns[nextColIdx]!
    const targetId  = nearestY(col, layout, probePos.y)
    probe = jumpProbe(probe, targetId, ecosystemState, nodes)
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────

  function handleKey(e: KeyboardEvent): void {
    switch (e.key) {
      case ' ': {
        e.preventDefault()
        stepEcosystem()
        break
      }
      case 'Tab': {
        e.preventDefault()
        const prev = history.pop()
        if (prev) {
          ecosystemState = prev
          isPaused       = true          // pause on step-back so player can look
          flashes        = []            // clear mid-flight overlays
          probe          = refreshProbe(probe, ecosystemState, nodes)
        }
        break
      }
      case 'p':
      case 'P': {
        isPaused = !isPaused
        if (!isPaused) lastTickMs = 0  // tick immediately on resume
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const back = moveProbeBack(probe, ecosystemState, nodes)
        if (back) probe = back
        break
      }
      case 'ArrowDown': {
        e.preventDefault()
        const { successors } = probe
        if (successors.length > 0) {
          const next = moveProbe(probe, successors[0]!, ecosystemState, nodes)
          if (next) probe = next
        }
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        moveLateral(-1)
        break
      }
      case 'ArrowRight': {
        e.preventDefault()
        moveLateral(+1)
        break
      }
      case 'r':
      case 'R': {
        reset()
        break
      }
    }
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  function onResize(): void {
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    layout  = layoutDAG(config.dag, canvas.width, canvas.height)
    columns = buildColumns(layout)
  }

  // ── RAF loop ───────────────────────────────────────────────────────────────

  function loop(now: DOMHighResTimeStamp): void {
    if (!active) return

    if (!isPaused && ecosystemState.running) {
      if (lastTickMs === 0 || now - lastTickMs >= tickIntervalMs) {
        stepEcosystem()
        lastTickMs = now
      }
    }

    flashes = flashes.map(f => ({ ...f, ttl: f.ttl - 1 })).filter(f => f.ttl > 0)

    const rs: RenderState = { ecosystemState, nodes, layout, flashes, probe, isPaused }
    renderFrame(ctx, rs)

    rafId = requestAnimationFrame(loop)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function reset(): void {
    ecosystemState = initEcosystem(config)
    probe          = refreshProbe(makeProbe(WIDE_J2_ENTRY), ecosystemState, nodes)
    history        = []
    flashes        = []
    isPaused       = true
    lastTickMs     = 0
  }

  return {
    start() {
      if (active) return
      active = true
      window.addEventListener('keydown', handleKey)
      window.addEventListener('resize', onResize)
      rafId = requestAnimationFrame(loop)
    },
    stop() {
      active = false
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(rafId)
    },
    reset,
  }
}

// ── Column builder ────────────────────────────────────────────────────────────
//
// Groups nodes by x-position (within EPS pixels) to create navigable columns
// for ← / → movement.  In wide-30: 6 columns — 011, F, j2-left, j2-centre,
// j2-right, I/1.  Columns are sorted left-to-right by ascending x.

const COLUMN_EPS = 15  // pixels — nodes within this x-distance share a column

function buildColumns(layout: LayoutMap): number[][] {
  const sorted = [...layout.entries()].sort((a, b) => a[1].x - b[1].x)
  const cols: { x: number; nodes: number[] }[] = []

  for (const [id, pos] of sorted) {
    const last = cols.at(-1)
    if (!last || pos.x - last.x > COLUMN_EPS) {
      cols.push({ x: pos.x, nodes: [id] })
    } else {
      last.nodes.push(id)
    }
  }

  return cols.map(c => c.nodes)
}

function nearestY(col: number[], layout: LayoutMap, targetY: number): number {
  let bestId   = col[0]!
  let bestDist = Infinity
  for (const id of col) {
    const pos  = layout.get(id)
    if (!pos) continue
    const dist = Math.abs(pos.y - targetY)
    if (dist < bestDist) { bestDist = dist; bestId = id }
  }
  return bestId
}
