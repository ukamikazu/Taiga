/**
 * Ecosystem orchestrator.
 *
 * Each call to `tickEcosystem` advances the simulation by one step:
 *   1. Compute engine step (closed-form, all models share the same engine
 *      seed in the standard configuration)
 *   2. Step each active model, collecting any termination events
 *   3. Apply predation between I/1 frontiers and co-located lower-phase models
 *   4. Write frontier records to the shared substrate
 *   5. Return the new EcosystemState plus the events that fired this tick
 */
import type {
  EcosystemConfig,
  EcosystemEvent,
  EcosystemState,
  ModelState,
  ModelType,
  Substrate,
} from './types.js'
import { engineStep } from './engine/recursion.js'
import { buildDAG, frontiersOverlap } from './engine/dag.js'
import { makeSubstrate, writeFrontier } from './engine/substrate.js'
import { makeModel } from './models/base.js'
import { stepModel011 } from './models/model011.js'
import { stepModelF   } from './models/modelF.js'
import { stepModelJ2  } from './models/modelJ2.js'
import { stepModelI1  } from './models/modelI1.js'

// ── Initialise ────────────────────────────────────────────────────────────────

export function initEcosystem(cfg: EcosystemConfig): EcosystemState {
  const models = new Map<string, ModelState>()
  for (let i = 0; i < cfg.models.length; i++) {
    const spec = cfg.models[i]
    if (!spec) continue
    const id = `${spec.type}-${i}`
    models.set(id, makeModel(id, spec.type, spec.entryNode))
  }

  return {
    step: 0,
    engine: engineStep(cfg.engine, 0),
    models,
    substrate: makeSubstrate(cfg.C),
    events: [],
    running: true,
  }
}

// ── Single tick ───────────────────────────────────────────────────────────────

export function tickEcosystem(
  state: EcosystemState,
  cfg: EcosystemConfig,
): EcosystemState {
  if (!state.running) return state

  const n    = state.step + 1
  const eng  = engineStep(cfg.engine, n)
  const nodes = buildDAG(cfg.dag)
  const events: EcosystemEvent[] = []

  // Step each model
  const updatedModels = new Map<string, ModelState>(state.models)

  for (const [id, m] of state.models) {
    if (!m.active) continue

    let result: { model: ModelState; fired: boolean }

    switch (m.type as ModelType) {
      case 'M011': {
        const r = stepModel011(m, eng, nodes, cfg.thetaUncon011)
        result = r
        if (r.fired) events.push({ step: n, kind: 'Uncon', modelId: id, payload: { I: r.model.I, degree: r.model.degree } })
        break
      }
      case 'MF': {
        const r = stepModelF(m, eng, nodes, cfg.thetaF)
        result = r
        if (r.fired) events.push({ step: n, kind: 'Uncon', modelId: id, payload: { I: r.model.I, degree: r.model.degree } })
        break
      }
      case 'Mj2': {
        const r = stepModelJ2(m, eng, nodes, cfg.thetaJ2)
        result = r
        if (r.fired) events.push({ step: n, kind: 'ModuleBirth', modelId: id, payload: { I: r.model.I, degree: r.model.degree, seedI: r.moduleSeedI } })
        break
      }
      case 'MI1': {
        const r = stepModelI1(m, eng, nodes, cfg.thetaSeveranceI1)
        result = r
        if (r.fired) events.push({ step: n, kind: 'Severance', modelId: id, payload: { I: r.model.I, degree: r.model.degree } })
        break
      }
    }

    updatedModels.set(id, result.model)
  }

  // Predation: I/1 instances predate lower-phase models when frontiers overlap
  applyPredation(updatedModels, n, cfg.predationStrength, events)

  // Write all active-model frontiers to shared substrate
  let substrate: Substrate = state.substrate
  for (const [id, m] of updatedModels) {
    if (!m.active && m.terminationStep !== n) continue // skip long-dead models
    substrate = writeFrontier(substrate, id, m.frontier, n)
    if (substrate.mergeCount > state.substrate.mergeCount) {
      events.push({ step: n, kind: 'SubstrateMerge', modelId: id, payload: { mergeCount: substrate.mergeCount } })
    }
  }

  const anyActive = [...updatedModels.values()].some(m => m.active)

  return {
    step: n,
    engine: eng,
    models: updatedModels,
    substrate,
    events: [...state.events, ...events],
    running: anyActive,
  }
}

// ── Run to completion ─────────────────────────────────────────────────────────

export function runEcosystem(
  cfg: EcosystemConfig,
  maxSteps = 200,
): EcosystemState {
  let state = initEcosystem(cfg)
  for (let i = 0; i < maxSteps && state.running; i++) {
    state = tickEcosystem(state, cfg)
  }
  return state
}

// ── Predation helper ──────────────────────────────────────────────────────────

function applyPredation(
  models: Map<string, ModelState>,
  step: number,
  strength: number,
  events: EcosystemEvent[],
): void {
  // Collect active I/1 instances and their frontiers
  const predators: ModelState[] = []
  const prey:      ModelState[] = []

  for (const m of models.values()) {
    if (!m.active) continue
    if (m.type === 'MI1') predators.push(m)
    else prey.push(m)
  }

  if (predators.length === 0 || prey.length === 0) return

  for (const predator of predators) {
    for (const target of prey) {
      if (!frontiersOverlap(predator.frontier, target.frontier)) continue
      if (Math.random() >= strength) continue

      // Predation: target loses one frontier node (partial-past deletion)
      // Finding 1: predation is population control, not I accumulation
      const newFrontier = target.frontier.slice(0, -1) // drop last node
      if (newFrontier.length === 0) newFrontier.push(target.frontier[0] ?? target.entryNode)

      models.set(target.id, { ...target, frontier: newFrontier })

      events.push({
        step,
        kind: 'Predation',
        modelId: predator.id,
        payload: { targetId: target.id, targetType: target.type },
      })
    }
  }
}
