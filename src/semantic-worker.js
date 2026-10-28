// Meaning search: embeds the query with the same model used at build time and ranks verses by their 4-bit
// vectors. The model (~34MB) only downloads the first time someone switches to meaning search; transformers.js
// caches it in the browser after that.

import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js'
import { EMBEDDING_MODEL, EMBEDDING_DTYPE, QUERY_PREFIX, parseVectors, scoreAll, topK } from './lib/semantic.js'

const VECTORS_URL = './data/vectors.bin'
const RESULT_LIMIT = 300

let ready

const load = () => (ready ??= (async () => {
  const files = new Map()
  const [vectors, extract] = await Promise.all([
    fetch(VECTORS_URL).then(response => response.arrayBuffer()).then(parseVectors),
    pipeline('feature-extraction', EMBEDDING_MODEL, {
      dtype: EMBEDDING_DTYPE,
      // Reports overall download progress across the model's files.
      progress_callback: event => {
        if (event.status !== 'progress' || !event.total) return
        files.set(event.file, [event.loaded, event.total])
        const [loaded, total] = [...files.values()].reduce(([l, t], [fl, ft]) => [l + fl, t + ft], [0, 0])
        postMessage({ type: 'progress', loaded, total })
      }
    })
  ])
  postMessage({ type: 'ready' })
  return { vectors, extract }
})())

onmessage = async ({ data }) => {
  if (data.type === 'load') {
    load().catch(error => postMessage({ type: 'error', message: String(error) }))
    return
  }
  if (data.type !== 'search') return
  try {
    const { vectors, extract } = await load()
    const output = await extract(QUERY_PREFIX + data.query, { pooling: 'cls', normalize: true })
    const ids = topK(scoreAll(output.data, vectors), RESULT_LIMIT, data.scope)
    postMessage({ type: 'results', id: data.id, ids })
  } catch (error) {
    postMessage({ type: 'error', id: data.id, message: String(error) })
  }
}
