/**
 * Particle system — 200-cap pool of drifting points emitted from active
 * model frontiers.  Each model type has distinct movement DNA:
 *
 *   M011 (cyan):  narrow vertical column, orderly, spine-like.
 *   MF   (amber): slow, settling — slight downward drift, low energy.
 *   Mj2  (violet): bifurcates on odd steps (nabla=1), reconverges on even.
 *   MI1  (rose):  spiral outward; opens on odd steps, contracts on even.
 *
 * Dissolve bursts (Uncon / Severance) use the same Particle type but are
 * created in a one-shot batch with higher initial speed.
 */
import type { ModelState, ModelType } from '../types.js'
import type { LayoutMap } from './layout.js'
import { MODEL_PALETTE } from './palette.js'

export interface Particle {
  x:        number
  y:        number
  vx:       number
  vy:       number
  life:     number
  maxLife:  number
  color:    string
  size:     number
  modelType: ModelType | null
}

export const MAX_PARTICLES = 200

// ── Per-frame update ──────────────────────────────────────────────────────────

export function updateParticles(particles: Particle[]): Particle[] {
  return particles
    .map(p => {
      let { x, y, vx, vy } = p
      x += vx; y += vy
      // Gentle drag + gravity for MF (settling effect)
      vx *= p.modelType === 'MF' ? 0.95 : 0.97
      vy *= p.modelType === 'MF' ? 0.95 : 0.97
      if (p.modelType === 'MF') vy += 0.03
      return { ...p, x, y, vx, vy, life: p.life - 1 }
    })
    .filter(p => p.life > 0)
}

// ── Emission — one call per active model per frame ────────────────────────────

export function emitParticles(
  m:       ModelState,
  nabla:   0 | 1,        // engine parity for this step (from ecosystemState.engine)
  layout:  LayoutMap,
  out:     Particle[],
): void {
  if (out.length >= MAX_PARTICLES) return

  const pal  = MODEL_PALETTE[m.type]
  // Probability of emitting one particle this frame from each frontier node
  const prob = Math.min(0.55, m.I / 2800)

  for (const nodeId of m.frontier) {
    if (out.length >= MAX_PARTICLES) break
    const pos = layout.get(nodeId)
    if (!pos || Math.random() > prob) continue

    const jitter = () => (Math.random() - 0.5) * 3
    let vx: number, vy: number

    switch (m.type) {
      case 'M011':
        // Orderly vertical column, spine-like
        vx = (Math.random() - 0.5) * 0.35
        vy = -0.6 - Math.random() * 0.9
        break
      case 'MF':
        // Slow, low energy, settles downward
        vx = (Math.random() - 0.5) * 0.9
        vy = (Math.random() - 0.5) * 0.5
        break
      case 'Mj2':
        // Bifurcates on odd steps, converges on even
        if (nabla === 1) {
          vx = (Math.random() > 0.5 ? 1 : -1) * (0.9 + Math.random() * 0.6)
          vy = -0.3 - Math.random() * 0.5
        } else {
          vx = (Math.random() - 0.5) * 0.3
          vy = -0.7 - Math.random() * 0.4
        }
        break
      case 'MI1':
        // Spiral outward; opens on odd, contracts on even
        {
          const angle = Math.random() * Math.PI * 2
          const speed = nabla === 1 ? 1.6 : 0.85
          vx = Math.cos(angle) * speed
          vy = Math.sin(angle) * speed
        }
        break
      default:
        vx = 0; vy = 0
    }

    out.push({
      x: pos.x + jitter(),
      y: pos.y + jitter(),
      vx, vy,
      life:    40 + Math.floor(Math.random() * 30),
      maxLife: 70,
      color:   pal.base,
      size:    1.6,
      modelType: m.type,
    })
  }
}

// ── Dissolve burst (Uncon / Severance) ───────────────────────────────────────

export function dissolveModel(
  m:          ModelState,
  isSeverance: boolean,
  layout:     LayoutMap,
  out:        Particle[],
): void {
  const pal   = MODEL_PALETTE[m.type]
  const count = isSeverance ? 22 : 10
  const speed = isSeverance ? 3.2 : 1.6

  for (const nodeId of m.frontier) {
    const pos = layout.get(nodeId)
    if (!pos) continue
    for (let i = 0; i < count && out.length < MAX_PARTICLES + 60; i++) {
      const angle = Math.random() * Math.PI * 2
      const s     = speed * (0.4 + Math.random() * 0.6)
      out.push({
        x: pos.x + (Math.random() - 0.5) * 6,
        y: pos.y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * s,
        vy: Math.sin(angle) * s,
        life:    50 + Math.floor(Math.random() * 30),
        maxLife: 80,
        color:   pal.base,
        size:    isSeverance ? 2.2 : 1.8,
        modelType: m.type,
      })
    }
  }
}
