import type { EventKind, ModelType } from '../types.js'

export interface ModelColors {
  base:    string   // frontier nodes / HUD label
  visited: string   // visited-but-not-frontier fill
  glow:    string   // shadowColor for glow effect
}

export const MODEL_PALETTE: Record<ModelType, ModelColors> = {
  M011: { base: '#00e5ff', visited: '#006478', glow: '#00e5ff' },  // cyan
  MF:   { base: '#ffb300', visited: '#7a5200', glow: '#ffb300' },  // amber
  Mj2:  { base: '#ce93d8', visited: '#6b3f72', glow: '#ce93d8' },  // violet
  MI1:  { base: '#ef5350', visited: '#7f2826', glow: '#ef5350' },  // rose
}

export const EVENT_FLASH: Record<EventKind, string> = {
  Uncon:          'rgba(255, 255, 255, 0.9)',
  ModuleBirth:    'rgba(0,   230, 118, 0.9)',
  Severance:      'rgba(255, 80,  80,  0.9)',
  Predation:      'rgba(255, 40,  40,  0.85)',
  SubstrateMerge: 'rgba(80,  130, 255, 0.85)',
  Stasis:         'rgba(200, 200, 200, 0.6)',
  ModelStep:      'rgba(255, 255, 255, 0.0)',
}

// ── Nested Taiga identity ─────────────────────────────────────────────────────
//
// 12 accent colours distinct from the four model colours
// (cyan, amber, violet, rose) and from each other.

export const GREEK_LETTERS = ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ'] as const

export const NESTED_ACCENTS = [
  '#ffd700',  // α — gold
  '#00ff99',  // β — mint green
  '#ff6633',  // γ — coral orange
  '#4488ff',  // δ — periwinkle blue
  '#ff33cc',  // ε — magenta
  '#33ffdd',  // ζ — aquamarine
  '#ff9900',  // η — warm orange
  '#88ff44',  // θ — chartreuse
  '#9944ff',  // ι — blue-violet
  '#ffbb88',  // κ — peach
  '#22aaff',  // λ — dodger blue
  '#eeff44',  // μ — bright yellow
] as const
