// Builds the search index off the main thread and answers queries with verse ids.

import { createCanon } from './lib/canon.js'
import { createScopes } from './lib/scope.js'
import { buildIndex, search } from './lib/search.js'

let state

const init = json => {
  const started = performance.now()
  const data = JSON.parse(json)
  const canon = createCanon(data)
  state = { canon, scopes: createScopes(canon), index: buildIndex(data.text), maskCache: new Map() }
  postMessage({ type: 'ready', ms: Math.round(performance.now() - started) })
}

const maskFor = keys => {
  const cacheKey = [...keys].sort().join(',')
  if (!state.maskCache.has(cacheKey)) state.maskCache.set(cacheKey, state.scopes.mask(keys))
  return state.maskCache.get(cacheKey)
}

const run = ({ id, query, scope, order }) => {
  const { canon, index } = state
  const result = search(index, query, { scope: maskFor(scope), order })
  const counts = Object.fromEntries(canon.works.map(work => [work.id, 0]))
  for (const verseId of result.unscoped) counts[canon.locate(verseId).work.id]++
  postMessage(
    { type: 'results', id, ids: result.ids, partial: result.partial, matched: [...result.matched], counts },
    [result.ids.buffer]
  )
}

onmessage = ({ data }) => {
  if (data.type === 'init') init(data.json)
  else if (data.type === 'search') run(data)
}
