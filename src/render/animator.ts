import type { EcosystemConfig, EventKind } from '../types.js'
import { buildDAG } from '../engine/dag.js'
import { initEcosystem, tickEcosystem } from '../ecosystem.js'
import { layoutDAG } from './layout.js'
import { EVENT_FLASH } from './palette.js'
import { type FlashOverlay, type RenderState, renderFrame } from './renderer.js'

export interface AnimatorOptions {
  config:          EcosystemConfig
  canvas:          HTMLCanvasElement
  tickIntervalMs?: number   // ms per ecosystem tick (default 500)
}

export interface Animator {
  start(): void
  stop():  void
  reset(): void
}

export function createAnimator(opts: AnimatorOptions): Animator {
  const { config, canvas } = opts
  const tickIntervalMs = opts.tickIntervalMs ?? 500

  const ctx   = canvas.getContext('2d')!
  const nodes = buildDAG(config.dag)

  let layout         = layoutDAG(config.dag, canvas.width, canvas.height)
  let ecosystemState = initEcosystem(config)
  let flashes: FlashOverlay[] = []
  let lastTickMs  = -Infinity   // force immediate first tick
  let rafId       = 0
  let active      = false

  function onResize(): void {
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    layout = layoutDAG(config.dag, canvas.width, canvas.height)
  }

  function loop(now: DOMHighResTimeStamp): void {
    if (!active) return

    // Ecosystem tick
    if (ecosystemState.running && now - lastTickMs >= tickIntervalMs) {
      const prevStep = ecosystemState.step
      ecosystemState = tickEcosystem(ecosystemState, config)
      lastTickMs = now

      // Flash overlays for events that fired this tick
      for (const ev of ecosystemState.events) {
        if (ev.step !== ecosystemState.step) continue

        const color = EVENT_FLASH[ev.kind as EventKind] ?? 'rgba(255,255,255,0.8)'
        if (ev.kind === 'ModelStep') continue  // no visual for plain steps

        let nodeIds: number[]
        if (ev.kind === 'SubstrateMerge') {
          const all: number[] = []
          for (const m of ecosystemState.models.values()) all.push(...m.visited)
          nodeIds = [...new Set(all)]
        } else {
          const model = ecosystemState.models.get(ev.modelId)
          nodeIds = model ? [...model.frontier] : []
        }

        if (nodeIds.length > 0) {
          flashes.push({ nodeIds, color, ttl: 12, maxTtl: 12 })
        }
      }

      void prevStep  // referenced to avoid unused-var lint
    }

    // Age overlays
    flashes = flashes.map(f => ({ ...f, ttl: f.ttl - 1 })).filter(f => f.ttl > 0)

    const rs: RenderState = { ecosystemState, nodes, layout, flashes }
    renderFrame(ctx, rs)

    rafId = requestAnimationFrame(loop)
  }

  return {
    start() {
      if (active) return
      active = true
      window.addEventListener('resize', onResize)
      rafId = requestAnimationFrame(loop)
    },
    stop() {
      active = false
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(rafId)
    },
    reset() {
      ecosystemState = initEcosystem(config)
      flashes        = []
      lastTickMs     = -Infinity
    },
  }
}
