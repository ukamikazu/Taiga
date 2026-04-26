import type { Substrate, SubstrateRecord } from '../types.js'

export function makeSubstrate(C: number): Substrate {
  return { records: [], C, mergeCount: 0 }
}

/** All unique node IDs that have been recorded. */
export function visitedNodes(s: Substrate): Set<number> {
  const v = new Set<number>()
  for (const r of s.records) v.add(r.nodeId)
  return v
}

/** L — current record count. */
export function load(s: Substrate): number {
  return s.records.length
}

/**
 * m = L / |V|.  Returns 0 when no records exist (avoids div-by-zero during
 * cold-start before any model has written).
 */
export function density(s: Substrate): number {
  const v = visitedNodes(s)
  return v.size === 0 ? 0 : s.records.length / v.size
}

/**
 * Frontier capacity for a model given the current substrate state.
 * cap = ⌊k / m⌋  where k is a per-model constant (here unified as 1 for
 * the initial simulation — models write one record per frontier node per step).
 * When m = 0 (empty substrate) returns Infinity — no constraint.
 */
export function frontierCap(s: Substrate, k = 1): number {
  const m = density(s)
  return m === 0 ? Infinity : Math.floor(k / m)
}

/**
 * Write one record into the substrate.  When L reaches C, fire compression ≡:
 * drop the two oldest records (merge), increment mergeCount.
 * Returns a new Substrate (immutable update).
 */
export function writeRecord(s: Substrate, rec: SubstrateRecord): Substrate {
  let records = [...s.records, rec]
  let mergeCount = s.mergeCount

  // Compression fires when capacity is reached (A9 — continuous substrate Uncon)
  if (records.length >= s.C) {
    // Drop the two oldest records, permanently losing their distinguishability
    records = records.slice(2)
    mergeCount += 1
  }

  return { ...s, records, mergeCount }
}

/**
 * Write records for every node in a model's current frontier.
 * Each write may trigger compression.
 */
export function writeFrontier(
  s: Substrate,
  modelId: string,
  frontier: number[],
  step: number,
): Substrate {
  let current = s
  for (const nodeId of frontier) {
    current = writeRecord(current, { nodeId, modelId, step })
  }
  return current
}
