import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createReferenceParser } from '../src/lib/reference.js'
import { createScopes } from '../src/lib/scope.js'
import { canon } from './fixtures.js'

const parse = createReferenceParser(canon)
const range = text => {
  const ref = parse(text)
  return ref && [canon.label(ref.start), canon.label(ref.end - 1)]
}

test('parses verses, ranges and whole chapters', () => {
  assert.deepEqual(range('alma 32:21'), ['Alma 32:21', 'Alma 32:21'])
  assert.deepEqual(range('1 ne 3:7'), ['1 Nephi 3:7', '1 Nephi 3:7'])
  assert.deepEqual(range('d&c 76:22-24'), ['D&C 76:22', 'D&C 76:24'])
  assert.deepEqual(range('Isaiah 2-3'), ['Isaiah 2:1', 'Isaiah 3:26'])
  assert.deepEqual(range('john 3'), ['John 3:1', 'John 3:36'])
  assert.deepEqual(range('Gen 1:31-2:3'), ['Genesis 1:31', 'Genesis 2:3'])
})

test('accepts common spellings of book names', () => {
  assert.equal(parse('1 Jn 4:8').book.name, '1 John')
  assert.equal(parse('psalm 23').book.name, 'Psalms')
  assert.equal(parse('Song of Solomon 2').book.name, 'Song of Solomon')
  assert.equal(parse('I Corinthians 13').book.name, '1 Corinthians')
  assert.equal(parse('JS-H 1:17').book.name, 'Joseph Smith—History')
  assert.equal(parse('deuter 6:5').book.name, 'Deuteronomy')
})

test('cites single-chapter books by verse', () => {
  assert.deepEqual(range('jude 3'), ['Jude 1:3', 'Jude 1:3'])
})

test('rejects non-references', () => {
  assert.equal(parse('faith'), null)
  assert.equal(parse('job'), null)
  assert.equal(parse('mo 3'), null)
  assert.equal(parse('alma 99'), null)
  assert.equal(parse('alma 32:999'), null)
})

test('scope keys never collide and every collection parses', () => {
  const keys = [...canon.works.map(w => w.id), ...canon.books.map(b => b.slug)]
  const { collections, mask } = createScopes(canon)
  keys.push(...collections.map(c => c.id))
  assert.equal(new Set(keys).size, keys.length)
  const isaiah = mask(['isaiah'])
  assert.equal(isaiah[canon.verseId(canon.book('mosiah'), 14, 5)], 1)
  assert.equal(isaiah[canon.verseId(canon.book('mosiah'), 13, 5)], 0)
})
