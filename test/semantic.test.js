import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DIMENSIONS, fuse, parseVectors, quantize, relatedTo, scoreAll, topK } from '../src/lib/semantic.js'

// Deterministic pseudo-random unit vectors so the test is repeatable.
const random = (seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5)(42)
const COUNT = 200
const vectors = new Float32Array(COUNT * DIMENSIONS)
for (let v = 0; v < COUNT; v++) {
  let norm = 0
  for (let d = 0; d < DIMENSIONS; d++) norm += (vectors[v * DIMENSIONS + d] = random()) ** 2
  for (let d = 0; d < DIMENSIONS; d++) vectors[v * DIMENSIONS + d] /= Math.sqrt(norm)
}
const packed = parseVectors(quantize(vectors).buffer)
const exactScores = query => Array.from({ length: COUNT }, (_, v) =>
  query.reduce((sum, x, d) => sum + x * vectors[v * DIMENSIONS + d], 0))

test('4-bit scores track full-precision dot products', () => {
  const query = vectors.subarray(7 * DIMENSIONS, 8 * DIMENSIONS)
  const approx = scoreAll(query, packed)
  const exact = exactScores(query)
  const worst = Math.max(...exact.map((score, v) => Math.abs(score - approx[v])))
  assert.ok(worst < 0.05, `max error ${worst}`)
  assert.equal(topK(approx, 1)[0], 7)
})

test('topK respects the scope mask', () => {
  const scope = new Uint8Array(COUNT).fill(1, 10, 20)
  const ids = topK(scoreAll(vectors.subarray(0, DIMENSIONS), packed), 5, scope)
  assert.equal(ids.length, 5)
  ids.forEach(id => assert.ok(id >= 10 && id < 20))
})

test('relatedTo reads a verse’s precomputed neighbors', () => {
  const related = Uint16Array.from({ length: 3 * 8 }, (_, i) => i)
  assert.deepEqual(relatedTo(related, 1), [8, 9, 10, 11, 12, 13, 14, 15])
})

test('fuse ranks items found by both lists first', () => {
  assert.deepEqual(fuse([1, 2, 3], [3, 4, 1]).slice(0, 2), [1, 3])
})
