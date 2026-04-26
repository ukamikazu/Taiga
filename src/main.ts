// Entry point — minimal canvas bootstrap.
// Simulation and rendering will be wired up in subsequent iterations.
import { runEcosystem } from './ecosystem.js'
import { CONFIG_CANONICAL, CONFIG_GAME } from './constants.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
canvas.width  = window.innerWidth
canvas.height = window.innerHeight

// Quick smoke test in the console
const canonical = runEcosystem(CONFIG_CANONICAL)
const game      = runEcosystem(CONFIG_GAME)

console.group('Taiga — Canonical (seed=1.0)')
for (const [id, m] of canonical.models) {
  console.log(`${id}: terminated @ n=${m.terminationStep} via ${m.terminationMode} (I=${m.I.toFixed(2)}, deg=${m.degree})`)
}
console.log(`Substrate merges: ${canonical.substrate.mergeCount}`)
console.groupEnd()

console.group('Taiga — Game (seed=0.01)')
for (const [id, m] of game.models) {
  console.log(`${id}: terminated @ n=${m.terminationStep} via ${m.terminationMode} (I=${m.I.toFixed(2)}, deg=${m.degree})`)
}
console.log(`Substrate merges: ${game.substrate.mergeCount}`)
console.groupEnd()
