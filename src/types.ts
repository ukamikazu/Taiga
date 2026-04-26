// ── Engine ────────────────────────────────────────────────────────────────────

export interface EngineConfig {
  y00: number   // y_{0,0} initial condition
  y10: number   // y_{1,0} initial condition
}

export interface EngineStep {
  n: number
  y0: number    // y_{0,n} closed-form (Eq. 35)
  y1: number    // y_{1,n} closed-form (Eq. 36)
  delta: 0 | 1  // Δn = 1 if n even, 0 if odd
  nabla: 0 | 1  // ∇n = 1 − Δn
}

// ── DAG ───────────────────────────────────────────────────────────────────────

export interface DAGNode {
  id: number
  successors: number[]
  predecessors: number[]
}

export type DAGTopology = 'wide30' | 'compressed16'

// ── Substrate ─────────────────────────────────────────────────────────────────

export interface SubstrateRecord {
  nodeId: number
  modelId: string
  step: number
}

export interface Substrate {
  records: SubstrateRecord[]   // R — bounded record pool
  C: number                    // capacity
  mergeCount: number           // total compression events so far
}

// Computed properties kept as free functions (see substrate.ts) to keep
// the data structure plain and serialisable.

// ── Models ────────────────────────────────────────────────────────────────────

export type ModelType = 'M011' | 'MF' | 'Mj2' | 'MI1'

export type TerminationMode =
  | 'Uncon'
  | 'ModuleBirth'
  | 'Severance'
  | 'Stasis'

export interface ModelState {
  id: string
  type: ModelType
  entryNode: number
  frontier: number[]           // current leading node(s) in the DAG
  visited: number[]            // all nodes the model has occupied
  degree: number               // accumulated Int degree
  I: number                    // trigger-check I = |y0_n| × (degree + 1)
  step: number                 // steps this model has been active
  active: boolean
  terminationStep: number | null
  terminationMode: TerminationMode | null
}

// ── Ecosystem events ──────────────────────────────────────────────────────────

export type EventKind =
  | 'ModelStep'
  | 'Predation'
  | 'ModuleBirth'
  | 'Uncon'
  | 'Severance'
  | 'Stasis'
  | 'SubstrateMerge'

export interface EcosystemEvent {
  step: number
  kind: EventKind
  modelId: string
  payload: Record<string, unknown>
}

// ── Ecosystem ─────────────────────────────────────────────────────────────────

export interface EcosystemConfig {
  engine: EngineConfig
  C: number                    // record pool capacity (32 default)
  dag: DAGTopology
  m0: number                   // initial M00 field density (0.20 default)
  thetaUncon011: number        // 011 Uncon I-threshold
  thetaSeveranceI1: number     // I/1 Severance I-threshold
  thetaJ2: number              // j-2 Module birth I-threshold
  thetaF: number               // F Uncon I-threshold
  predationStrength: number    // 0–1 (0.50 default)
  eta: number                  // Uncon feedback efficiency (0.20 default)
  models: Array<{
    type: ModelType
    entryNode: number
  }>
}

export interface EcosystemState {
  step: number
  engine: EngineStep
  models: Map<string, ModelState>
  substrate: Substrate
  events: EcosystemEvent[]
  running: boolean
}
