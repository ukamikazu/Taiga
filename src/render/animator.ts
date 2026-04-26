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
import {
  type NestedTaigaState,
  createNestedTaiga,
  tickNestedTaiga,
} from '../nested/nestedTaiga.js'
import { layoutDAG, type LayoutMap } from './layout.js'
import { EVENT_FLASH, NESTED_ACCENTS, GREEK_LETTERS } from './palette.js'
import {
  type Particle,
  MAX_PARTICLES,
  updateParticles,
  emitParticles,
  dissolveModel,
} from './particles.js'
import { type FlashOverlay, type Shockwave, type RenderState, renderFrame } from './renderer.js'

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
  let history: EcosystemState[]       = []
  let flashes: FlashOverlay[]         = []
  let nestedTaigas: NestedTaigaState[]= []
  let shockwaves: Shockwave[]         = []
  let particles: Particle[]           = []
  let edgeLuminosity                  = new Map<string, number>()
  let breathePhase = 0
  let lastTickMs   = 0
  let isPaused     = true
  let rafId        = 0
  let active       = false

  // ── Ecosystem step ─────────────────────────────────────────────────────────

  function stepEcosystem(): void {
    if (!ecosystemState.running) return
    history.push(ecosystemState)
    ecosystemState = tickEcosystem(ecosystemState, config)
    probe = refreshProbe(probe, ecosystemState, nodes)

    // Update edge luminosity — decay existing, light incoming frontier edges
    const DECAY_PER_STEP = 1 / 3.5
    for (const [k, v] of edgeLuminosity) {
      const next = v - DECAY_PER_STEP
      if (next <= 0) edgeLuminosity.delete(k)
      else edgeLuminosity.set(k, next)
    }
    for (const m of ecosystemState.models.values()) {
      if (!m.active) continue
      for (const nodeId of m.frontier) {
        const node = nodes[nodeId]
        if (!node) continue
        for (const predId of node.predecessors) {
          edgeLuminosity.set(`${predId}-${nodeId}`, 1.0)
        }
      }
    }

    // Process events
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

      // Uncon / Severance → dissolve burst
      if (ev.kind === 'Uncon' || ev.kind === 'Severance') {
        const model = ecosystemState.models.get(ev.modelId)
        if (model) dissolveModel(model, ev.kind === 'Severance', layout, particles)
      }

      // ModuleBirth → spawn nested Taiga + shockwave
      if (ev.kind === 'ModuleBirth' && nestedTaigas.length < GREEK_LETTERS.length) {
        const idx    = nestedTaigas.length
        const accent = NESTED_ACCENTS[idx]!
        const letter = GREEK_LETTERS[idx]!
        const model  = ecosystemState.models.get(ev.modelId)
        const spawnPos = avgFrontierPos(model?.frontier ?? [], layout, canvas)
        nestedTaigas.push(createNestedTaiga(
          idx, ecosystemState.step, model?.frontier[0] ?? 0,
          spawnPos.x, spawnPos.y, accent, letter,
        ))
        // Shockwave expands to cover the canvas diagonal in ~60 frames
        const maxR = Math.hypot(canvas.width, canvas.height)
        shockwaves.push({ x: spawnPos.x, y: spawnPos.y, radius: 0, maxRadius: maxR, color: accent, ttl: 60, maxTtl: 60 })
      }
    }

    // Tick all living nested sims
    nestedTaigas = nestedTaigas.map(tickNestedTaiga)
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
          isPaused       = true
          flashes        = []
          shockwaves     = []
          // Remove nested Taigas born after the restored step
          nestedTaigas   = nestedTaigas.filter(t => t.birthParentStep <= ecosystemState.step)
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

    const anySimRunning = ecosystemState.running || nestedTaigas.some(t => t.simState.running)

    if (!isPaused && anySimRunning) {
      if (lastTickMs === 0 || now - lastTickMs >= tickIntervalMs) {
        if (ecosystemState.running) {
          stepEcosystem()
        } else {
          // Parent done — keep ticking nested sims on their own
          nestedTaigas = nestedTaigas.map(tickNestedTaiga)
        }
        lastTickMs = now
      }
    }

    if (!isPaused) {
      // Per-frame: shockwave expansion
      shockwaves = shockwaves
        .map(s => ({ ...s, radius: s.radius + s.maxRadius / 60, ttl: s.ttl - 1 }))
        .filter(s => s.ttl > 0)

      // Per-frame: particle emission from active frontiers
      for (const m of ecosystemState.models.values()) {
        if (!m.active) continue
        emitParticles(m, ecosystemState.engine.nabla, layout, particles)
      }
      particles = updateParticles(particles)
      if (particles.length > MAX_PARTICLES) particles = particles.slice(-MAX_PARTICLES)

      // Per-frame: dodecagon drift + rotation + birth animation
      const parentDone = !ecosystemState.running
      nestedTaigas = nestedTaigas.map(t => updateDodecagonFrame(t, parentDone, canvas.width, canvas.height))

      // Breathing phase
      const rhoApprox = ecosystemState.substrate.records.length / ecosystemState.substrate.C
      breathePhase += 0.022 + rhoApprox * 0.058
    }

    flashes = flashes.map(f => ({ ...f, ttl: f.ttl - 1 })).filter(f => f.ttl > 0)

    const rs: RenderState = {
      ecosystemState, nodes, layout, flashes, probe, isPaused,
      breathePhase, nestedTaigas, edgeLuminosity, shockwaves, particles,
    }
    renderFrame(ctx, rs)

    rafId = requestAnimationFrame(loop)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function reset(): void {
    ecosystemState = initEcosystem(config)
    probe          = refreshProbe(makeProbe(WIDE_J2_ENTRY), ecosystemState, nodes)
    history        = []
    flashes        = []
    nestedTaigas   = []
    shockwaves     = []
    particles      = []
    edgeLuminosity.clear()
    breathePhase   = 0
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

// ── Nested Taiga helpers ──────────────────────────────────────────────────────

/** Average pixel position of a set of frontier nodes. */
function avgFrontierPos(
  frontier: number[],
  layout:   LayoutMap,
  canvas:   HTMLCanvasElement,
): { x: number; y: number } {
  if (frontier.length === 0) return { x: canvas.width / 2, y: canvas.height / 2 }
  let sx = 0, sy = 0, n = 0
  for (const id of frontier) {
    const p = layout.get(id)
    if (p) { sx += p.x; sy += p.y; n++ }
  }
  return n > 0 ? { x: sx / n, y: sy / n } : { x: canvas.width / 2, y: canvas.height / 2 }
}

const DODEC_MARGIN = 30   // px from canvas edges

/** Per-frame visual update for one dodecagon: drift, rotation, birth anim. */
function updateDodecagonFrame(
  t:          NestedTaigaState,
  parentDone: boolean,
  cw:         number,
  ch:         number,
): NestedTaigaState {
  // Birth crystallisation (~20 frames to reach 1.0)
  const birthAnim = Math.min(1, t.birthAnim + 0.05)

  // Inner rotation: base + density-proportional rate
  const { simState } = t
  const rho = simState.substrate.records.length / simState.substrate.C
  const innerAngle = t.innerAngle + 0.008 + rho * 0.035

  // Flash TTL decrement
  const innerFlashTtl = Math.max(0, t.innerFlashTtl - 1)

  // Drift
  let { x, y, vx, vy } = t

  if (!parentDone) {
    // Directed: drift toward nursery slot in bottom-right
    const targetX = cw * 0.80 + (t.idx % 4) * 34 - 51
    const targetY = ch * 0.78 + Math.floor(t.idx / 4) * 34 - 17
    const dx = targetX - x, dy = targetY - y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 4) {
      vx += (dx / dist * 0.35 - vx) * 0.04
      vy += (dy / dist * 0.35 - vy) * 0.04
    } else {
      vx *= 0.85; vy *= 0.85
    }
  } else {
    // Free roil — gentle random walk
    vx += (Math.random() - 0.5) * 0.12
    vy += (Math.random() - 0.5) * 0.12
    const spd = Math.sqrt(vx * vx + vy * vy)
    if (spd > 0.9) { vx *= 0.9 / spd; vy *= 0.9 / spd }
  }

  x += vx; y += vy

  // Bounce off canvas edges
  if (x < DODEC_MARGIN)        { x = DODEC_MARGIN;        vx = Math.abs(vx) }
  if (x > cw - DODEC_MARGIN)   { x = cw - DODEC_MARGIN;   vx = -Math.abs(vx) }
  if (y < DODEC_MARGIN)        { y = DODEC_MARGIN;        vy = Math.abs(vy) }
  if (y > ch - DODEC_MARGIN)   { y = ch - DODEC_MARGIN;   vy = -Math.abs(vy) }

  return { ...t, x, y, vx, vy, birthAnim, innerAngle, innerFlashTtl }
}
