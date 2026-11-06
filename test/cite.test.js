import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CITE_FORMATS, cite } from '../src/lib/cite.js'

const passage = {
  reference: 'D&C 4:1–2',
  url: 'https://www.churchofjesuschrist.org/study/scriptures/dc-testament/dc/4?lang=eng&id=p1-p2#p1',
  texts: ['Now behold, a marvelous work…', 'Therefore, O ye that embark…']
}

test('copies the reference or link alone', () => {
  assert.deepEqual(cite(passage, 'reference'), { text: 'D&C 4:1–2' })
  assert.deepEqual(cite(passage, 'link'), { text: passage.url })
})

test('quotes the verses as one passage with the reference', () => {
  assert.equal(cite(passage, 'text').text, '“Now behold, a marvelous work… Therefore, O ye that embark…” (D&C 4:1–2)')
})

test('links the reference in HTML and escapes it', () => {
  const href = passage.url.replaceAll('&', '&amp;')
  assert.equal(cite(passage, 'linked-reference').html, `<a href="${href}">D&amp;C 4:1–2</a>`)
  assert.equal(cite(passage, 'text-linked').html,
    `“Now behold, a marvelous work… Therefore, O ye that embark…” (<a href="${href}">D&amp;C 4:1–2</a>)`)
})

test('keeps the link in plain text for apps that ignore HTML', () => {
  assert.equal(cite(passage, 'linked-reference').text, `D&C 4:1–2 (${passage.url})`)
  assert.ok(cite(passage, 'text-linked').text.endsWith(`(D&C 4:1–2)\n${passage.url}`))
})

test('writes a Markdown blockquote', () => {
  assert.equal(cite(passage, 'markdown').text,
    `> “Now behold, a marvelous work… Therefore, O ye that embark…”\n>\n> — [D&C 4:1–2](${passage.url})`)
})

test('every listed format is supported', () => {
  for (const { id } of CITE_FORMATS) assert.ok(cite(passage, id).text)
})
