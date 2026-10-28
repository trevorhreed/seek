#!/usr/bin/env node
// Embeds every verse with the same model the browser uses for queries and writes data/semantic/vectors.bin,
// 4 bits per dimension per verse (see src/lib/semantic.js). It's committed, since embedding takes minutes.
// Full-precision embeddings are cached in .cache/ so changing the quantization doesn't re-embed, and
// scripts/build-related.py reads them to precompute related verses.

import { pipeline } from '@huggingface/transformers'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMBEDDING_MODEL, EMBEDDING_DTYPE, DIMENSIONS, quantize } from '../src/lib/semantic.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, 'src/data/scriptures.json')
const CACHE = resolve(ROOT, '.cache/embeddings.f32')
const OUT = resolve(ROOT, 'data/semantic')
const BATCH_SIZE = 64

const data = JSON.parse(await readFile(DATA, 'utf8'))
const count = data.text.length

const embedAll = async () => {
  if (existsSync(CACHE)) return new Float32Array((await readFile(CACHE)).buffer.slice(0))
  const extract = await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: EMBEDDING_DTYPE })
  const vectors = new Float32Array(count * DIMENSIONS)
  const started = Date.now()
  for (let i = 0; i < count; i += BATCH_SIZE) {
    const batch = data.text.slice(i, i + BATCH_SIZE)
    const output = await extract(batch, { pooling: 'cls', normalize: true })
    vectors.set(output.data, i * DIMENSIONS)
    if ((i / BATCH_SIZE) % 20 === 0) {
      const rate = (i + batch.length) / ((Date.now() - started) / 1000)
      console.log(`${i + batch.length}/${count} verses, ${rate.toFixed(0)}/s`)
    }
  }
  await mkdir(dirname(CACHE), { recursive: true })
  await writeFile(CACHE, new Uint8Array(vectors.buffer))
  return vectors
}

const vectors = await embedAll()
const quantized = quantize(vectors)
await mkdir(OUT, { recursive: true })
await writeFile(resolve(OUT, 'vectors.bin'), quantized)
console.log(`Wrote ${OUT}/vectors.bin (${quantized.length} B)`)
