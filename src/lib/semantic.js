// Meaning search over 4-bit verse vectors. Each dimension is quantized to 16 levels between per-dimension
// bounds; the query stays full precision. At ~8MB this ranks ~91% the same as full-precision cosine
// similarity (1 bit per dimension was 2MB but only ~54%).

export const EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5'
export const EMBEDDING_DTYPE = 'q8'
export const DIMENSIONS = 384
export const RELATED_COUNT = 8
// bge models expect this instruction on queries (not on the passages being searched).
export const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '

const LEVELS = 16
const BYTES_PER_VERSE = DIMENSIONS / 2
// Bounds clip the extreme 0.5% of values per dimension so outliers don't waste levels.
const CLIP_PERCENT = 0.5
// File layout: Float32 lower bound per dimension, Float32 step per dimension, then 4-bit codes, two per byte.
const HEADER_BYTES = DIMENSIONS * 4 * 2

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1)))]

// Build time: full-precision vectors (count × DIMENSIONS) to the compact file.
export const quantize = vectors => {
  const count = vectors.length / DIMENSIONS
  const buffer = new ArrayBuffer(HEADER_BYTES + count * BYTES_PER_VERSE)
  const lower = new Float32Array(buffer, 0, DIMENSIONS)
  const step = new Float32Array(buffer, DIMENSIONS * 4, DIMENSIONS)
  const codes = new Uint8Array(buffer, HEADER_BYTES)
  const column = new Float32Array(count)
  for (let d = 0; d < DIMENSIONS; d++) {
    for (let v = 0; v < count; v++) column[v] = vectors[v * DIMENSIONS + d]
    const sorted = column.slice().sort()
    lower[d] = percentile(sorted, CLIP_PERCENT)
    step[d] = (percentile(sorted, 100 - CLIP_PERCENT) - lower[d]) / (LEVELS - 1) || 1
    for (let v = 0; v < count; v++) {
      const code = Math.max(0, Math.min(LEVELS - 1, Math.round((column[v] - lower[d]) / step[d])))
      codes[v * BYTES_PER_VERSE + (d >> 1)] |= d & 1 ? code << 4 : code
    }
  }
  return new Uint8Array(buffer)
}

export const parseVectors = buffer => ({
  lower: new Float32Array(buffer, 0, DIMENSIONS),
  step: new Float32Array(buffer, DIMENSIONS * 4, DIMENSIONS),
  codes: new Uint8Array(buffer, HEADER_BYTES),
  count: (buffer.byteLength - HEADER_BYTES) / BYTES_PER_VERSE
})

// query · (lower + step × code) = query · lower + Σ (query × step) × code. The second term is summed with a
// table per byte (two dimensions × 256 code pairs), so each verse costs 192 lookups.
export const scoreAll = (query, { lower, step, codes, count }) => {
  let base = 0
  const weights = new Float32Array(DIMENSIONS)
  for (let d = 0; d < DIMENSIONS; d++) {
    base += query[d] * lower[d]
    weights[d] = query[d] * step[d]
  }
  const tables = new Float32Array(BYTES_PER_VERSE * 256)
  for (let b = 0; b < BYTES_PER_VERSE; b++) {
    for (let value = 0; value < 256; value++) {
      tables[b * 256 + value] = weights[2 * b] * (value & 15) + weights[2 * b + 1] * (value >> 4)
    }
  }
  const scores = new Float32Array(count)
  for (let v = 0; v < count; v++) {
    let score = base
    const offset = v * BYTES_PER_VERSE
    for (let b = 0; b < BYTES_PER_VERSE; b++) score += tables[b * 256 + codes[offset + b]]
    scores[v] = score
  }
  return scores
}

// Best-scoring verse ids, optionally limited to a scope mask.
export const topK = (scores, k, scope = null) => {
  const ids = []
  for (let id = 0; id < scores.length; id++) if (!scope || scope[id]) ids.push(id)
  ids.sort((a, b) => scores[b] - scores[a])
  return ids.slice(0, k)
}

// Related verses are precomputed at build time (scripts/build-related.py), RELATED_COUNT ids per verse.
export const relatedTo = (related, id) => [...related.subarray(id * RELATED_COUNT, (id + 1) * RELATED_COUNT)]

// Reciprocal rank fusion: blends keyword and meaning rankings without having to calibrate their scores.
const RRF_K = 60
export const fuse = (...rankings) => {
  const scores = new Map()
  for (const ranking of rankings) {
    ranking.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1)))
  }
  return [...scores.keys()].sort((a, b) => scores.get(b) - scores.get(a) || a - b)
}
