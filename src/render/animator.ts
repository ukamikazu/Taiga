import type { EcosystemConfig, EventKind } from '../types.js'
import { buildDAG } from '../engine/dag.js'
import {
  WIDE_011_ENTRY,
  WIDE_F_ENTRY,
  WIDE_J2_ENTRY,
  WIDE_I1_ENTRY,
} from '../engine/dag.js'
import { initEcosystem, tickEcosystem } from '../ecosystem.js'
import { makeProbe, refreshProbe, moveProbe, jumpProbe } from '../probe.js'
import { layoutDAG } from './layout.js'
import { EVENT_FLASH } from './palette.js'
import { type FlashOverlay, type RenderState, renderFrame } from './renderer.js'

export interface AnimatorOptions {
  config:          EcosystemConfig
  canvas:          HTMLCanvasElement
  tickIntervalMs?: number   // default 500ms per ecosystem tick
}

export interface Animator {
  start(): void
  stop():  void
  reset(): void
}

// Cluster entry nodes for Tab-jumping (wide-30 topology)
const CLUSTER_ENTRIES = [
  WIDE_011_ENTRY,   // 0
  WIDE_F_ENTRY,     // 20
  WIDE_J2_ENTRY,    // 40
  WIDE_I1_ENTRY,    // 60
]

export function createAnimator(opts: AnimatorOptions): Animator {
  const { config, canvas } = opts
  const tickIntervalMs = opts.tickIntervalMs ?? 500

  const ctx   = canvas.getContext('2d')!
  const nodes = buildDAG(config.dag)

  let layout         = layoutDAG(config.dag, canvas.width, canvas.height)
  let ecosystemState = initEcosystem(config)
  let probe          = refreshProbe(makeProbe(WIDE_J2_ENTRY), ecosystemState, nodes)
  let flashes: FlashOverlay[] = []
  let lastTickMs  = -Infinity
  let rafId       = 0
  let active      = false

  // ── Probe keyboard handling ────────────────────────────────────────────────

  // Index into CLUSTER_ENTRIES for Tab-cycling
  let clusterIdx = CLUSTER_ENTRIES.indexOf(WIDE_J2_ENTRY)

  function handleKey(e: KeyboardEvent): void {
    const succs = probe.successors

    switch (e.key) {
      case ' ':
      case 'Enter':
      case 'ArrowDown': {
        e.preventDefault()
        if (succs.length > 0) {
          // Default forward: first (lower-numbered) successor
          const next = moveProbe(probe, succs[0]!, ecosystemState, nodes)
          if (next) probe = next
        }
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        if (succs.length > 0) {
          const next = moveProbe(probe, succs[0]!, ecosystemState, nodes)
          if (next) probe = next
        }
        break
      }
      case 'ArrowRight': {
        e.preventDefault()
        if (succs.length > 1) {
          // At a branch: right key takes the higher-indexed successor
          const next = moveProbe(probe, succs[succs.length - 1]!, ecosystemState, nodes)
          if (next) probe = next
        } else if (succs.length === 1) {
          const next = moveProbe(probe, succs[0]!, ecosystemState, nodes)
          if (next) probe = next
        }
        break
      }
      case 'Tab': {
        e.preventDefault()
        clusterIdx = (clusterIdx + 1) % CLUSTER_ENTRIES.length
        probe = jumpProbe(probe, CLUSTER_ENTRIES[clusterIdx]!, ecosystemState, nodes)
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
    layout = layoutDAG(config.dag, canvas.width, canvas.height)
  }

  // ── RAF loop ───────────────────────────────────────────────────────────────

  function loop(now: DOMHighResTimeStamp): void {
    if (!active) return

    if (ecosystemState.running && now - lastTickMs >= tickIntervalMs) {
      ecosystemState = tickEcosystem(ecosystemState, config)
      lastTickMs = now

      // Refresh probe sense after each ecosystem tick (the world changed)
      probe = refreshProbe(probe, ecosystemState, nodes)

      // Convert this tick's events to flash overlays
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

        if (nodeIds.length > 0) flashes.push({ nodeIds, color, ttl: 12, maxTtl: 12 })
      }
    }

    flashes = flashes.map(f => ({ ...f, ttl: f.ttl - 1 })).filter(f => f.ttl > 0)

    const rs: RenderState = { ecosystemState, nodes, layout, flashes, probe }
    renderFrame(ctx, rs)

    rafId = requestAnimationFrame(loop)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function reset(): void {
    ecosystemState = initEcosystem(config)
    clusterIdx     = CLUSTER_ENTRIES.indexOf(WIDE_J2_ENTRY)
    probe          = refreshProbe(makeProbe(WIDE_J2_ENTRY), ecosystemState, nodes)
    flashes        = []
    lastTickMs     = -Infinity
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
