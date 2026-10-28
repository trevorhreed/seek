// Resolves scope keys (work ids, book slugs, collection ids) to the set of verse ids a search may return.
// Keys share one namespace so the URL can hold them as a flat list: ?in=bofm,isa,sermon-on-the-mount

import { COLLECTIONS } from './collections.js'
import { createReferenceParser } from './reference.js'

export const createScopes = canon => {
  const parse = createReferenceParser(canon, { allowBareBook: true })

  const collections = COLLECTIONS.map(collection => ({
    ...collection,
    ranges: collection.refs.map(ref => {
      const parsed = parse(ref)
      if (!parsed) throw new Error(`Collection ${collection.id} has an unparseable ref: ${ref}`)
      return [parsed.start, parsed.end]
    })
  }))
  const collectionById = new Map(collections.map(collection => [collection.id, collection]))

  const rangesFor = key => {
    const work = canon.work(key)
    if (work) return [[work.start, work.end]]
    const book = canon.book(key)
    if (book) return [[book.start, book.end]]
    return collectionById.get(key)?.ranges ?? null
  }

  const isKey = key => rangesFor(key) !== null

  // Returns a Uint8Array with 1 for every in-scope verse, or null for "everything".
  const mask = keys => {
    const ranges = keys.flatMap(key => rangesFor(key) ?? [])
    if (!ranges.length) return null
    const result = new Uint8Array(canon.verseCount)
    for (const [start, end] of ranges) result.fill(1, start, end)
    return result
  }

  const labelFor = key => canon.work(key)?.name ?? canon.book(key)?.name ?? collectionById.get(key)?.name ?? key

  return { collections, isKey, mask, labelFor }
}
