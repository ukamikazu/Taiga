/**
 * Nested Taiga — a background simulation born at each j-2 ModuleBirth.
 *
 * Runs a full CONFIG_GAME ecosystem in the background, tracking its own
 * substrate density and any granddaughter ModuleBirth events (depth-2 only).
 * No further nested sims are created for granddaughters — they are text only.
 *
 * Visual position (x,y) is managed by the animator per animation frame.
 * The sim itself steps once per parent ecosystem tick.
 */
import type { EcosystemState } from '../types.js'
import { initEcosystem, tickEcosystem } from '../ecosystem.js'
import { CONFIG_GAME } from '../constants.js'
import { density } from '../engine/substrate.js'

export interface NestedTaigaDaughter {
  id:        string   // e.g. "α-i"
  birthStep: number   // internal step at which granddaughter born
}

export interface NestedTaigaState {
  id:              string    // Greek letter
  idx:             number    // 0–11 birth order index
  accent:          string    // unique stroke/label colour
  birthParentStep: number    // parent ecosystem step at birth
  birthNodeId:     number    // frontier node where ModuleBirth fired
  spawnX:          number    // initial canvas x
  spawnY:          number    // initial canvas y

  // Canvas position — updated by animator each frame
  x:  number
  y:  number
  vx: number
  vy: number

  // Background simulation
  simState:  EcosystemState
  daughters: NestedTaigaDaughter[]

  // Visual animation state — updated by animator each frame
  birthAnim:      number   // 0→1 crystallisation progress
  innerAngle:     number   // rotating inner polygon angle (radians)
  innerFlashTtl:  number   // frames — granddaughter birth interior flash
}

const ROMAN = ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii']

export function createNestedTaiga(
  idx:             number,
  birthParentStep: number,
  birthNodeId:     number,
  spawnX:          number,
  spawnY:          number,
  accent:          string,
  letter:          string,
): NestedTaigaState {
  return {
    id: letter,
    idx,
    accent,
    birthParentStep,
    birthNodeId,
    spawnX,
    spawnY,
    x:  spawnX,
    y:  spawnY,
    vx: 0,
    vy: 0,
    simState:     initEcosystem(CONFIG_GAME),
    daughters:    [],
    birthAnim:    0,
    innerAngle:   0,
    innerFlashTtl: 0,
  }
}

/**
 * Advance the nested sim by one step.  Call once per parent ecosystem tick.
 * Returns a new NestedTaigaState (immutable update).
 * Does NOT update visual position/animation — that is the animator's job.
 */
export function tickNestedTaiga(taiga: NestedTaigaState): NestedTaigaState {
  if (!taiga.simState.running) return taiga

  const nextSim = tickEcosystem(taiga.simState, CONFIG_GAME)

  // Detect granddaughter ModuleBirth events (depth-2: text only)
  const daughters = [...taiga.daughters]
  let innerFlashTtl = taiga.innerFlashTtl

  for (const ev of nextSim.events) {
    if (ev.step !== nextSim.step) continue
    if (ev.kind === 'ModuleBirth' && daughters.length < 12) {
      const roman = ROMAN[daughters.length] ?? String(daughters.length + 1)
      daughters.push({ id: `${taiga.id}-${roman}`, birthStep: nextSim.step })
      innerFlashTtl = 25   // set flash; animator decrements per frame
    }
  }

  return { ...taiga, simState: nextSim, daughters, innerFlashTtl }
}

/** Internal substrate density of a nested Taiga (L/|V|). */
export function nestedDensity(taiga: NestedTaigaState): number {
  return density(taiga.simState.substrate)
}
