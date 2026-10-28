// Meaning search over 1-bit verse vectors. The query keeps full precision and each verse stores only the sign
// of each dimension, so a verse's score is the query's components added or subtracted by those signs. That
// keeps the download to ~2MB while ranking close to full-precision cosine similarity.

export const EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5'
export const EMBEDDING_DTYPE = 'q8'
export const DIMENSIONS = 384
export const RELATED_COUNT = 8
// bge models expect this instruction on queries (not on the passages being searched).
export const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '

const BYTES = DIMENSIONS / 8

// For each byte position, the signed sum of the query components that byte's 8 bits cover, for all 256 values,
// so scoring a verse is 48 table lookups instead of 384 multiplies.
const byteTables = query => {
  const tables = new Float32Array(BYTES * 256)
  for (let b = 0; b < BYTES; b++) {
    for (let value = 0; value < 256; value++) {
      let sum = 0
      for (let bit = 0; bit < 8; bit++) {
        const component = query[b * 8 + bit]
        sum += value & (1 << bit) ? component : -component
      }
      tables[b * 256 + value] = sum
    }
  }
  return tables
}

export const scoreAll = (query, bits) => {
  const count = bits.length / BYTES
  const tables = byteTables(query)
  const scores = new Float32Array(count)
  for (let v = 0; v < count; v++) {
    let score = 0
    const base = v * BYTES
    for (let b = 0; b < BYTES; b++) score += tables[b * 256 + bits[base + b]]
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

// A verse's nearest neighbors by its own sign vector, skipping [excludeStart, excludeEnd) (its chapter), so
// related verses point elsewhere instead of at the next verse over.
export const relatedTo = (bits, id, excludeStart, excludeEnd, k = RELATED_COUNT) => {
  const signs = new Float32Array(DIMENSIONS)
  for (let d = 0; d < DIMENSIONS; d++) signs[d] = bits[id * BYTES + (d >> 3)] & (1 << (d & 7)) ? 1 : -1
  const scores = scoreAll(signs, bits)
  for (let v = excludeStart; v < excludeEnd; v++) scores[v] = -Infinity
  return topK(scores, k)
}

// Reciprocal rank fusion: blends keyword and meaning rankings without having to calibrate their scores.
const RRF_K = 60
export const fuse = (...rankings) => {
  const scores = new Map()
  for (const ranking of rankings) {
    ranking.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1)))
  }
  return [...scores.keys()].sort((a, b) => scores.get(b) - scores.get(a) || a - b)
}
