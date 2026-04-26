import { CONFIG_GAME } from './constants.js'
import { createAnimator } from './render/animator.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
canvas.width  = window.innerWidth
canvas.height = window.innerHeight

const animator = createAnimator({
  config:         CONFIG_GAME,
  canvas,
  tickIntervalMs: 500,
})

animator.start()

// Press R to restart
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    animator.reset()
  }
})
