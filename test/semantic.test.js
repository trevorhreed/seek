import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DIMENSIONS, fuse, relatedTo, scoreAll, topK } from '../src/lib/semantic.js'

const BYTES = DIMENSIONS / 8

// Deterministic pseudo-random vectors so the test is repeatable.
const random = (seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5)(42)
const vectors = Array.from({ length: 50 }, () => Float32Array.from({ length: DIMENSIONS }, random))
const bits = new Uint8Array(vectors.length * BYTES)
vectors.forEach((vector, v) => vector.forEach((x, d) => { if (x > 0) bits[v * BYTES + (d >> 3)] |= 1 << (d & 7) }))

test('scoreAll equals the query dotted with each verse sign vector', () => {
  const query = vectors[7]
  const scores = scoreAll(query, bits)
  vectors.forEach((vector, v) => {
    const expected = vector.reduce((sum, x, d) => sum + (x > 0 ? query[d] : -query[d]), 0)
    assert.ok(Math.abs(scores[v] - expected) < 1e-4)
  })
  assert.equal(topK(scores, 1)[0], 7)
})

test('topK respects the scope mask', () => {
  const scope = new Uint8Array(vectors.length).fill(1, 10, 20)
  const ids = topK(scoreAll(vectors[3], bits), 5, scope)
  assert.equal(ids.length, 5)
  ids.forEach(id => assert.ok(id >= 10 && id < 20))
})

test('relatedTo skips the excluded range, including the verse itself', () => {
  const ids = relatedTo(bits, 5, 0, 10, 4)
  assert.equal(ids.length, 4)
  ids.forEach(id => assert.ok(id >= 10))
})

test('fuse ranks items found by both lists first', () => {
  assert.deepEqual(fuse([1, 2, 3], [3, 4, 1]).slice(0, 2), [1, 3])
})
