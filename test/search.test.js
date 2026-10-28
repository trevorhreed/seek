import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stem, parseQuery, search } from '../src/lib/search.js'
import { canon, getIndex } from './fixtures.js'

const labels = (query, options) => [...search(getIndex(), query, options).ids].map(canon.label)

test('stem merges modern and KJV inflections', () => {
  for (const family of [
    ['love', 'loves', 'loved', 'loving', 'loveth', 'lovest'],
    ['bless', 'blessed', 'blesseth', 'blessing', 'blesses'],
    ['sin', 'sins', 'sinned', 'sinneth', 'sinning'],
    ['cry', 'cries', 'cried', 'crieth'],
    ['come', 'comes', 'cometh', 'coming']
  ]) {
    assert.equal(new Set(family.map(stem)).size, 1, family.join(', '))
  }
})

test('stem keeps apart words that only look inflected', () => {
  for (const [a, b] of [['thee', 'the'], ['here', 'her'], ['forest', 'for'], ['evening', 'even'], ['this', 'thy']]) {
    assert.notEqual(stem(a), stem(b), `${a} / ${b}`)
  }
})

test('parseQuery splits phrases, exclusions and a trailing prefix', () => {
  const { terms, phrases, excluded } = parseQuery('"strait and narrow" -war pea')
  assert.deepEqual(phrases, [['strait', 'and', 'narrow']])
  assert.deepEqual(excluded, ['war'])
  assert.deepEqual(terms.map(t => [t.stem, t.prefix]), [['strait', false], ['and', false], ['narrow', false], ['pea', true]])
  assert.equal(parseQuery('peace ').terms[0].prefix, false)
})

test('every result contains every term', () => {
  const results = labels('faith hope charity')
  assert.ok(results.includes('Moroni 7:1'))
  assert.ok(results.includes('1 Corinthians 13:13'))
  assert.ok(results.length > 10)
})

test('ranks the classic verse first for a distinctive query', () => {
  assert.equal(labels('if any of you lack wisdom')[0], 'James 1:5')
  assert.equal(labels('men are that they might have joy')[0], '2 Nephi 2:25')
})

test('quoted phrases must appear in order', () => {
  const results = labels('"strait and narrow"')
  assert.ok(results.includes('2 Nephi 31:18'))
  const index = getIndex()
  for (const id of search(index, '"strait and narrow"').ids) {
    assert.match(index.texts[id].toLowerCase(), /strait and narrow/)
  }
})

test('excluded terms remove verses', () => {
  const index = getIndex()
  const ids = search(index, 'peace -war').ids
  assert.ok(ids.length > 0)
  for (const id of ids) assert.doesNotMatch(index.texts[id].toLowerCase(), /\bwars?\b/)
})

test('a partial last word matches as a prefix', () => {
  assert.ok(labels('charit').includes('Moroni 7:47'))
})

test('falls back to partial matches when no verse has every term', () => {
  const result = search(getIndex(), 'charity zzzzz')
  assert.equal(result.partial, true)
  assert.ok(result.ids.length > 0)
})

test('scope limits results without changing unscoped matches', () => {
  const alma = canon.book('alma')
  const scope = new Uint8Array(canon.verseCount).fill(1, alma.start, alma.end)
  const result = search(getIndex(), 'faith', { scope })
  assert.ok(result.ids.length > 0)
  for (const id of result.ids) assert.equal(canon.locate(id).book.slug, 'alma')
  assert.ok(result.unscoped.length > result.ids.length)
})

test('canonical order sorts by verse id', () => {
  const ids = [...search(getIndex(), 'charity', { order: 'canonical' }).ids]
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b))
})
