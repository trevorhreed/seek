import { createCanon } from './lib/canon.js'
import { CITE_FORMATS, cite } from './lib/cite.js'
import { createReferenceFinder } from './lib/reference.js'
import { createScopes } from './lib/scope.js'
import { forEachWord, stem } from './lib/search.js'
import { fuse, relatedTo } from './lib/semantic.js'

const DATA_URL = './data/scriptures.json'
const RELATED_URL = './data/related.bin'
// Embedding a query costs more than a keyword lookup, so meaning search waits a little longer between keystrokes.
const MEANING_DEBOUNCE_MS = 300
const MEANING_KEYWORD_LIMIT = 300
const PAGE_SIZE = 40
const MAX_REFERENCE_VERSES = 200
const SEARCH_DEBOUNCE_MS = 120
const THEME_KEY = 'seek:theme'
const THEMES = ['auto', 'light', 'dark']
const THEME_LABELS = { auto: 'match system', light: 'light', dark: 'dark' }
const COPY_FEEDBACK_MS = 1500

const $ = id => document.getElementById(id)
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children.filter(child => child !== null && child !== undefined))
  return node
}
const formatNumber = new Intl.NumberFormat('en-US').format

const ui = {
  query: $('query'),
  status: $('status'),
  order: $('order'),
  mode: $('mode'),
  related: $('related'),
  relatedTitle: $('related-title'),
  relatedToggle: $('related-toggle'),
  relatedList: $('related-list'),
  results: $('results'),
  sentinel: $('sentinel'),
  welcome: $('welcome'),
  workChips: $('work-chips'),
  customChips: $('custom-chips'),
  openPicker: $('open-picker'),
  picker: $('picker'),
  pickerBody: $('picker-body'),
  pickerFilter: $('picker-filter'),
  pickerClear: $('picker-clear'),
  reader: $('reader'),
  readerTitle: $('reader-title'),
  readerWork: $('reader-work'),
  readerBody: $('reader-body'),
  readerPrev: $('reader-prev'),
  readerNext: $('reader-next'),
  readerLink: $('reader-link'),
  readerClose: $('reader-close'),
  cite: $('cite'),
  citeRef: $('cite-ref'),
  citeHint: $('cite-hint'),
  citeCopy: $('cite-copy'),
  citeMenu: $('cite-menu'),
  theme: $('theme')
}

const state = {
  query: '',
  scope: new Set(),
  order: 'relevance',
  mode: 'words',
  pending: null,
  ids: [],
  rendered: 0,
  matched: new Set(),
  counts: null,
  reader: null,
  searchId: 0,
  ready: false
}

// The top bar and filter chips stick together; the reader sizes itself to the space below them.
const masthead = document.querySelector('.masthead')
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--masthead-h', `${masthead.offsetHeight}px`)
}).observe(masthead)

// ---- Theme -------------------------------------------------------------------------------------------------

const storage = {
  get: key => { try { return localStorage.getItem(key) } catch { return null } },
  set: (key, value) => { try { localStorage.setItem(key, value) } catch {} }
}

const applyTheme = theme => {
  if (theme === 'auto') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
  const label = `Theme: ${THEME_LABELS[theme]}`
  ui.theme.title = label
  ui.theme.ariaLabel = `${label}. Switch to ${THEME_LABELS[THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]]}`
  ui.theme.dataset.theme = theme
}
applyTheme(THEMES.includes(storage.get(THEME_KEY)) ? storage.get(THEME_KEY) : 'auto')
ui.theme.addEventListener('click', () => {
  const next = THEMES[(THEMES.indexOf(ui.theme.dataset.theme) + 1) % THEMES.length]
  storage.set(THEME_KEY, next)
  applyTheme(next)
})

// ---- Boot --------------------------------------------------------------------------------------------------

ui.status.textContent = 'Loading scriptures…'
const json = await fetch(DATA_URL).then(response => {
  if (!response.ok) throw new Error(`Couldn't load ${DATA_URL}: ${response.status}`)
  return response.text()
})
const data = JSON.parse(json)
const canon = createCanon(data)
const scopes = createScopes(canon)
const findReferences = createReferenceFinder(canon)

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
worker.postMessage({ type: 'init', json })
ui.status.textContent = `Indexing ${formatNumber(canon.verseCount)} verses…`

worker.addEventListener('message', ({ data: message }) => {
  if (message.type === 'ready') {
    state.ready = true
    runSearch()
  } else if (message.type === 'results' && message.id === state.searchId) {
    if (state.mode === 'meaning') {
      state.pending.keyword = message
      showMeaningResults()
    } else showResults(message)
  }
})

// ---- Meaning search ----------------------------------------------------------------------------------------

let semanticWorker
let semanticReady = false
const getSemanticWorker = () => {
  if (semanticWorker) return semanticWorker
  semanticWorker = new Worker(new URL('./semantic-worker.js', import.meta.url), { type: 'module' })
  semanticWorker.addEventListener('message', ({ data: message }) => {
    if (message.type === 'progress' && state.mode === 'meaning' && !semanticReady) {
      ui.status.textContent = `Downloading the meaning model (one time)… ${Math.round(100 * message.loaded / message.total)}%`
    } else if (message.type === 'ready') {
      semanticReady = true
    } else if (message.type === 'results' && message.id === state.searchId && state.pending) {
      state.pending.semantic = message.ids
      showMeaningResults()
    } else if (message.type === 'error') {
      ui.status.textContent = `Meaning search failed: ${message.message}`
    }
  })
  semanticWorker.addEventListener('error', () => {
    ui.status.textContent = 'Meaning search couldn’t load. Check your connection and try again.'
  })
  semanticWorker.postMessage({ type: 'load' })
  return semanticWorker
}

const maskCache = new Map()
const scopeMask = () => {
  const key = [...state.scope].sort().join(',')
  if (!maskCache.has(key)) maskCache.set(key, scopes.mask([...state.scope]))
  return maskCache.get(key)
}

// Blends the keyword and meaning rankings once both have arrived for the current query.
const showMeaningResults = () => {
  const { keyword, semantic } = state.pending ?? {}
  if (!keyword || !semantic) return
  state.matched = new Set(keyword.matched)
  state.counts = null
  renderWorkChips()
  if (state.reader) refreshReaderHighlights()
  let ids = fuse([...keyword.ids.slice(0, MEANING_KEYWORD_LIMIT)], semantic)
  if (state.order === 'canonical') ids = ids.sort((a, b) => a - b)
  const where = state.scope.size ? ` in ${[...state.scope].map(scopes.labelFor).join(', ')}` : ''
  setResults(ids, [el('strong', { textContent: formatNumber(ids.length) }), ` ${ids.length === 1 ? 'verse' : 'verses'}${where}`])
}

// ---- Related verses ----------------------------------------------------------------------------------------

let relatedPromise
const loadRelated = () => (relatedPromise ??= fetch(RELATED_URL)
  .then(response => response.arrayBuffer())
  .then(buffer => new Uint16Array(buffer)))

const showRelated = async verseId => {
  ui.related.hidden = false
  ui.relatedTitle.textContent = `Related to ${canon.label(verseId)}`
  ui.relatedList.replaceChildren(el('li', { className: 'related-empty', textContent: 'Finding related verses…' }))
  const related = await loadRelated()
  if (state.reader?.id !== verseId) return
  ui.relatedList.replaceChildren(...relatedTo(related, verseId).map(id => {
    const item = el('li', {},
      el('button', { type: 'button' },
        el('span', { className: 'related-ref', textContent: canon.label(id) }),
        el('span', { className: 'related-text', textContent: data.text[id] })))
    item.dataset.work = canon.locate(id).work.id
    item.querySelector('button').addEventListener('click', () => openPassage({ start: id, end: id + 1 }))
    return item
  }))
}

ui.relatedToggle.addEventListener('click', () => {
  const expanded = ui.relatedToggle.getAttribute('aria-expanded') === 'true'
  ui.relatedToggle.setAttribute('aria-expanded', !expanded)
  ui.related.classList.toggle('collapsed', expanded)
})

// ---- URL state ---------------------------------------------------------------------------------------------

const readUrl = () => {
  const params = new URLSearchParams(location.search)
  state.query = params.get('q') ?? ''
  state.scope = new Set((params.get('in') ?? '').split(',').filter(scopes.isKey))
  state.order = params.get('sort') === 'canonical' ? 'canonical' : 'relevance'
  state.mode = params.get('mode') === 'meaning' ? 'meaning' : 'words'
  // v=john.3.16 or a range, v=john.3.16-18
  const [slug, chapter, verses = ''] = (params.get('v') ?? '').split('.')
  const [verse, last] = verses.split('-').map(Number)
  const book = canon.book(slug)
  if (book && canon.verseId(book, Number(chapter), verse || 1) >= 0) {
    const lastValid = last > verse && canon.verseId(book, Number(chapter), last) >= 0
    state.reader = { book, chapter: Number(chapter), verse: verse || null, last: lastValid ? last : verse || null }
  }
}

const writeUrl = () => {
  const params = new URLSearchParams()
  if (state.query) params.set('q', state.query)
  if (state.scope.size) params.set('in', [...state.scope].join(','))
  if (state.order !== 'relevance') params.set('sort', state.order)
  if (state.mode !== 'words') params.set('mode', state.mode)
  if (state.reader) {
    const { book, chapter, verse, last } = state.reader
    params.set('v', [book.slug, chapter, last > verse ? `${verse}-${last}` : verse].filter(Boolean).join('.'))
  }
  const search = params.toString().replace(/%2C/g, ',')
  history.replaceState(null, '', search ? `?${search}` : location.pathname)
}

// ---- Highlighting ------------------------------------------------------------------------------------------

// Wraps every word whose stem matched the query in <mark>, building text nodes so verse text is never parsed as HTML.
const highlight = (text, matched) => {
  const fragment = document.createDocumentFragment()
  if (!matched.size) {
    fragment.append(text)
    return fragment
  }
  let cursor = 0
  forEachWord(text, (word, start, end) => {
    if (!matched.has(stem(word))) return
    fragment.append(text.slice(cursor, start), el('mark', { textContent: text.slice(start, end) }))
    cursor = end
  })
  fragment.append(text.slice(cursor))
  return fragment
}

// ---- Scope chips -------------------------------------------------------------------------------------------

const scopebar = document.querySelector('.scopebar')
// Switches the volume chips to short names (OT, NT…) when the full names don't fit the filter row, e.g. once
// match counts are added to each chip; past that the row scrolls sideways, with faded edges as the hint.
const fitScopebar = () => {
  scopebar.classList.remove('compact')
  const overflows = () => scopebar.scrollWidth > scopebar.clientWidth
  scopebar.classList.toggle('compact', overflows())
  scopebar.classList.toggle('overflowing', overflows())
}
window.addEventListener('resize', fitScopebar)

// ---- Tooltips ----------------------------------------------------------------------------------------------

const TOOLTIP_DELAY_MS = 350
const TOOLTIP_GAP = 8
const tooltip = el('div', { className: 'tooltip', role: 'tooltip' })
document.body.append(tooltip)
let tooltipTimer

const showTooltip = target => {
  tooltip.textContent = target.dataset.tip
  const rect = target.getBoundingClientRect()
  const left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2
  tooltip.style.left = `${Math.max(TOOLTIP_GAP, Math.min(left, innerWidth - tooltip.offsetWidth - TOOLTIP_GAP))}px`
  tooltip.style.top = `${rect.bottom + TOOLTIP_GAP}px`
  tooltip.classList.add('visible')
}

const hideTooltip = () => {
  clearTimeout(tooltipTimer)
  tooltip.classList.remove('visible')
}

document.addEventListener('pointerover', event => {
  const target = event.target.closest?.('[data-tip]')
  hideTooltip()
  if (target && event.pointerType === 'mouse') tooltipTimer = setTimeout(() => showTooltip(target), TOOLTIP_DELAY_MS)
})
document.addEventListener('focusin', event => {
  if (event.target.matches('[data-tip]:focus-visible')) showTooltip(event.target)
})
document.addEventListener('focusout', hideTooltip)
document.addEventListener('pointerdown', hideTooltip)
scopebar.addEventListener('scroll', hideTooltip, { passive: true })

const renderWorkChips = () => {
  ui.workChips.replaceChildren(...canon.works.map(work => {
    const count = state.counts?.[work.id]
    const selected = state.scope.has(work.id)
    const matches = count === undefined ? '' : ` · ${formatNumber(count)} ${count === 1 ? 'match' : 'matches'}`
    const chip = el('button', {
      type: 'button',
      className: 'chip',
      ariaLabel: `${work.name}${matches}`
    },
    el('span', { className: 'swatch' }),
    el('span', { className: 'chip-label-long', textContent: work.name }),
    el('span', { className: 'chip-label-short', textContent: work.short }),
    count === undefined ? null : el('span', { className: 'count', textContent: formatNumber(count) }))
    chip.dataset.work = work.id
    chip.dataset.tip = `${work.name}${matches}\n${selected ? 'Click to stop filtering' : 'Click to search only here'}`
    if (count === 0) chip.dataset.empty = ''
    chip.setAttribute('aria-pressed', selected)
    chip.addEventListener('click', () => toggleScope(work.id))
    return chip
  }))
  fitScopebar()
}

const renderCustomChips = () => {
  const keys = [...state.scope].filter(key => !canon.work(key))
  ui.customChips.replaceChildren(...keys.map(key => {
    const book = canon.book(key)
    const chip = el('button', {
      type: 'button',
      className: 'chip chip-removable',
      ariaLabel: `Remove ${scopes.labelFor(key)} filter`
    },
    el('span', { className: 'swatch' }),
    el('span', { textContent: scopes.labelFor(key) }),
    el('span', { className: 'chip-x', 'aria-hidden': true, textContent: '×' }))
    chip.dataset.tip = `${book ? `${book.name} (${book.work.name})` : scopes.labelFor(key)}\nClick to remove`
    if (book) chip.dataset.work = book.work.id
    else chip.dataset.collection = ''
    chip.setAttribute('aria-pressed', 'true')
    chip.addEventListener('click', () => toggleScope(key))
    return chip
  }))
  fitScopebar()
}

const toggleScope = key => {
  if (state.scope.has(key)) state.scope.delete(key)
  else state.scope.add(key)
  scopeChanged()
}

const scopeChanged = () => {
  renderWorkChips()
  renderCustomChips()
  syncPicker()
  writeUrl()
  runSearch()
}

// ---- Picker ------------------------------------------------------------------------------------------------

const pickerOption = (key, label, extra = {}) => {
  const option = el('button', { type: 'button', className: 'option', ...extra }, el('span', { textContent: label }))
  option.dataset.key = key
  option.dataset.label = label.toLowerCase()
  option.addEventListener('click', () => toggleScope(key))
  return option
}

const buildPicker = () => {
  const collections = el('section', { className: 'picker-section' },
    el('h3', { textContent: 'Collections' }),
    el('div', { className: 'collection-grid' }, ...scopes.collections.map(collection => {
      const option = pickerOption(collection.id, collection.name, { className: 'option option-card' })
      option.append(el('small', { textContent: collection.description }))
      option.dataset.label += ` ${collection.description.toLowerCase()}`
      return option
    })))
  const works = canon.works.map(work => {
    const section = el('section', { className: 'picker-section' },
      el('h3', {}, el('span', { className: 'swatch' }), work.name),
      el('div', { className: 'book-grid' }, ...work.books.map(book => pickerOption(book.slug, book.name))))
    section.dataset.work = work.id
    return section
  })
  ui.pickerBody.replaceChildren(collections, ...works)
  syncPicker()
}

const syncPicker = () => {
  ui.pickerBody.querySelectorAll('.option').forEach(option => {
    option.setAttribute('aria-pressed', state.scope.has(option.dataset.key))
  })
}

const filterPicker = () => {
  const needle = ui.pickerFilter.value.trim().toLowerCase()
  ui.pickerBody.querySelectorAll('.picker-section').forEach(section => {
    let visible = 0
    section.querySelectorAll('.option').forEach(option => {
      const show = !needle || option.dataset.label.includes(needle)
      option.hidden = !show
      visible += show
    })
    section.hidden = visible === 0
  })
}

ui.openPicker.addEventListener('click', () => {
  ui.pickerFilter.value = ''
  filterPicker()
  ui.picker.showModal()
  ui.pickerFilter.focus()
})
ui.pickerFilter.addEventListener('input', filterPicker)
ui.pickerFilter.addEventListener('keydown', event => {
  // Enter picks the only remaining book instead of submitting the dialog.
  if (event.key !== 'Enter') return
  event.preventDefault()
  const visible = [...ui.pickerBody.querySelectorAll('.option:not([hidden])')]
  if (visible.length === 1) visible[0].click()
})
ui.pickerClear.addEventListener('click', () => {
  state.scope.clear()
  scopeChanged()
})
ui.picker.addEventListener('click', event => {
  if (event.target === ui.picker) ui.picker.close()
})

// ---- Results -----------------------------------------------------------------------------------------------

// An entry is a verse id, or a { start, end } passage when listing candidate references.
const resultItem = (entry, index) => {
  const start = typeof entry === 'number' ? entry : entry.start
  const end = typeof entry === 'number' ? start + 1 : entry.end
  const { book, work, chapter, verse } = canon.locate(start)
  const last = canon.locate(end - 1)
  const link = el('a', {
    className: 'result-link',
    href: end - start === 1 || last.chapter === chapter
      ? canon.studyUrl(book, chapter, verse, last.verse)
      : canon.studyUrl(book, chapter),
    target: '_blank',
    rel: 'noopener',
    title: 'Open on churchofjesuschrist.org',
    ariaLabel: `Open ${canon.rangeLabel(start, end)} on churchofjesuschrist.org`,
    tabIndex: -1
  })
  link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>'
  const text = end - start === 1 ? data.text[start] : `${data.text[start]} …`
  const item = el('li', { className: 'result', tabIndex: 0 },
    el('div', { className: 'result-meta' },
      el('span', { className: 'swatch' }),
      el('span', { className: 'result-ref', textContent: canon.rangeLabel(start, end) }),
      el('span', { className: 'result-work', textContent: work.short }),
      link),
    el('p', { className: 'result-text' }, highlight(text, state.matched)))
  item.dataset.work = work.id
  item.dataset.id = start
  if (end - start > 1) item.dataset.end = end
  item.dataset.index = index
  if (state.reader?.id === start) item.classList.add('active')
  return item
}

const renderMore = () => {
  const next = state.ids.slice(state.rendered, state.rendered + PAGE_SIZE)
  ui.results.append(...next.map((id, offset) => resultItem(id, state.rendered + offset)))
  state.rendered += next.length
}

const setResults = (ids, status) => {
  state.ids = ids
  state.rendered = 0
  ui.results.replaceChildren()
  if (window.scrollY > 0) window.scrollTo({ top: 0 })
  ui.status.replaceChildren(...[].concat(status))
  renderMore()
}

const showResults = ({ ids, matched, counts }) => {
  state.matched = new Set(matched)
  state.counts = counts
  renderWorkChips()
  if (state.reader) refreshReaderHighlights()
  const total = ids.length
  const where = state.scope.size ? ` in ${[...state.scope].map(scopes.labelFor).join(', ')}` : ''
  let status
  if (!total) status = `No verses found${where}.`
  else status = [el('strong', { textContent: formatNumber(total) }), ` ${total === 1 ? 'verse' : 'verses'}${where}`]
  setResults([...ids], status)
}

// With no query, a scope of books or collections lists its chapters to browse instead of an empty page.
const showBrowse = () => {
  state.counts = null
  state.matched = new Set()
  renderWorkChips()
  const keys = [...state.scope]
  if (!keys.length) {
    setResults([], state.ready ? '' : ui.status.textContent)
    return
  }
  setResults([], `Searching only ${keys.map(scopes.labelFor).join(', ')}. Type to search, or pick a chapter.`)
  const groups = keys.flatMap(key => {
    const book = canon.book(key)
    if (book) {
      return [el('li', { className: 'browse' },
        el('h3', { textContent: book.name }),
        el('div', { className: 'chapter-grid' }, ...book.chapters.map((_, index) => {
          const button = el('button', { type: 'button', textContent: index + 1 })
          button.addEventListener('click', () => openReader(book, index + 1))
          return button
        })))]
    }
    const collection = scopes.collections.find(c => c.id === key)
    if (collection) {
      return [el('li', { className: 'browse' },
        el('h3', { textContent: collection.name }),
        el('div', { className: 'passage-list' }, ...collection.ranges.map(([start, end]) => {
          const from = canon.locate(start)
          const button = el('button', { type: 'button', textContent: canon.rangeLabel(start, end) })
          button.addEventListener('click', () => openReader(from.book, from.chapter, from.verse, end - 1))
          return button
        })))]
    }
    return []
  })
  ui.results.append(...groups)
}

// Opens a passage: a whole chapter opens at the top, anything narrower opens with those verses selected.
const openPassage = ({ start, end }) => {
  const from = canon.locate(start)
  const wholeChapter = from.verse === 1 && end === canon.chapterRange(from.book, from.chapter)[1]
  openReader(from.book, from.chapter, wholeChapter ? null : from.verse, end - 1)
}

// One reference lists its verses; an ambiguous shortcut ("ne222") lists each passage it could mean.
const showReferences = references => {
  state.counts = null
  state.matched = new Set()
  renderWorkChips()
  const [first] = references
  const go = el('button', { type: 'button', className: 'link-button', textContent: `Open ${canon.rangeLabel(first.start, first.end)}` })
  go.addEventListener('click', () => openPassage(first))
  const hint = el('span', { className: 'hint', textContent: ' or press Enter' })
  if (references.length > 1) {
    setResults(references, [go, hint, el('span', { className: 'hint', textContent: ` · ${references.length} possible references` })])
    return
  }
  const ids = []
  for (let id = first.start; id < first.end && ids.length < MAX_REFERENCE_VERSES; id++) ids.push(id)
  setResults(ids, [go, hint])
}

let debounceTimer
const runSearch = () => {
  clearTimeout(debounceTimer)
  const query = state.query.trim()
  document.body.classList.toggle('has-query', Boolean(query || state.scope.size))
  const references = query ? findReferences(query) : []
  if (references.length) return showReferences(references)
  if (!query) return showBrowse()
  if (!state.ready) return
  const meaning = state.mode === 'meaning'
  debounceTimer = setTimeout(() => {
    state.searchId++
    worker.postMessage({ type: 'search', id: state.searchId, query: state.query, scope: [...state.scope], order: state.order })
    if (meaning) {
      state.pending = { keyword: null, semantic: null }
      getSemanticWorker().postMessage({ type: 'search', id: state.searchId, query: state.query.trim(), scope: scopeMask() })
      if (semanticReady) ui.status.textContent = 'Searching by meaning…'
    }
  }, meaning ? MEANING_DEBOUNCE_MS : SEARCH_DEBOUNCE_MS)
}

new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting) && state.rendered < state.ids.length) renderMore()
}, { rootMargin: '600px' }).observe(ui.sentinel)

// ---- Reader ------------------------------------------------------------------------------------------------

const openReader = (book, chapter, verse = null, lastVerseId = null) => {
  const [start, end] = canon.chapterRange(book, chapter)
  const first = verse ? start + verse - 1 : null
  const last = lastVerseId !== null ? Math.min(lastVerseId, end - 1) : first
  selectionAnchor = first

  ui.readerWork.textContent = book.work.name
  ui.readerTitle.textContent = book.chapters.length > 1 || book.slug === 'dc' ? `${book.name} ${chapter}` : book.name
  ui.reader.dataset.work = book.work.id

  const verses = []
  for (let id = start; id < end; id++) {
    const p = el('p', { className: 'verse', id: `v${id - start + 1}` },
      el('span', { className: 'verse-num', textContent: id - start + 1 }),
      ' ',
      el('span', { className: 'verse-text' }, highlight(data.text[id], state.matched)))
    p.dataset.id = id
    verses.push(p)
  }
  ui.readerBody.replaceChildren(...verses)
  selectVerses(book, chapter, first, last)

  const chapterIndex = book.firstChapter + chapter - 1
  ui.readerPrev.disabled = chapterIndex === 0
  ui.readerNext.disabled = chapter === book.chapters.length && book.index === canon.books.length - 1

  ui.reader.hidden = false
  document.body.classList.add('reading')
  const target = first !== null ? verses[first - start] : null
  // Scroll only the reader pane; scrollIntoView would also scroll the page and tuck the reader under the top bar.
  requestAnimationFrame(() => {
    ui.readerBody.scrollTop = target
      ? target.offsetTop - (ui.readerBody.clientHeight - target.offsetHeight) / 2
      : 0
  })
  ui.results.querySelectorAll('.result.active').forEach(item => item.classList.remove('active'))
  if (first !== null) ui.results.querySelector(`.result[data-id="${first}"]`)?.classList.add('active')
}

// Marks verse ids first..last (or nothing, when first is null) in the open chapter as the selection to cite.
const selectVerses = (book, chapter, first, last = first) => {
  const [start] = canon.chapterRange(book, chapter)
  const verse = first === null ? null : first - start + 1
  const lastVerse = first === null ? null : last - start + 1
  const changedFirst = state.reader?.id !== first
  state.reader = { book, chapter, verse, last: lastVerse, id: first, lastId: first === null ? null : last }
  ui.readerBody.querySelectorAll('.verse').forEach(p => {
    const id = Number(p.dataset.id)
    p.classList.toggle('selected', first !== null && id >= first && id <= last)
  })
  ui.readerLink.href = canon.studyUrl(book, chapter, verse, lastVerse)
  renderCite()
  if (first === null) ui.related.hidden = true
  else if (changedFirst || ui.related.hidden) showRelated(first)
  writeUrl()
}

// Clicking a verse selects it and shows what it relates to; ⌘/Ctrl-clicking selects whole verses from the last
// plain-clicked one to it. Shift-click would be the convention, but the browser spends it extending text selection.
let selectionAnchor = null
ui.readerBody.addEventListener('click', event => {
  const verse = event.target.closest('.verse')
  if (!verse || !state.reader || getSelection().toString()) return
  const id = Number(verse.dataset.id)
  const { book, chapter } = state.reader
  if ((event.metaKey || event.ctrlKey) && selectionAnchor !== null && state.reader.id !== null) {
    selectVerses(book, chapter, Math.min(selectionAnchor, id), Math.max(selectionAnchor, id))
  } else {
    selectionAnchor = id
    selectVerses(book, chapter, id)
  }
})

// ---- Citing ------------------------------------------------------------------------------------------------

const selectedPassage = () => {
  const { book, chapter, verse, last, id, lastId } = state.reader
  return {
    reference: canon.rangeLabel(id, lastId + 1),
    url: canon.studyUrl(book, chapter, verse, last),
    texts: data.text.slice(id, lastId + 1)
  }
}

const renderCite = () => {
  const { id, lastId, book, chapter } = state.reader ?? {}
  ui.cite.hidden = id === null || id === undefined
  closeCiteMenu()
  if (ui.cite.hidden) return
  ui.citeRef.textContent = canon.rangeLabel(id, lastId + 1)
}

// Rich editors take the HTML so the reference stays a link; everything else gets the plain text.
const writeClipboard = ({ text, html }) => html && window.ClipboardItem
  ? navigator.clipboard.write([new ClipboardItem({
    'text/plain': new Blob([text], { type: 'text/plain' }),
    'text/html': new Blob([html], { type: 'text/html' })
  })])
  : navigator.clipboard.writeText(text)

let copyFeedbackTimer
const showCopyFeedback = message => {
  clearTimeout(copyFeedbackTimer)
  ui.citeCopy.dataset.feedback = message
  copyFeedbackTimer = setTimeout(() => delete ui.citeCopy.dataset.feedback, COPY_FEEDBACK_MS)
}

const openCiteMenu = () => {
  ui.citeMenu.hidden = false
  ui.citeCopy.setAttribute('aria-expanded', 'true')
  ui.citeMenu.querySelector('[role="menuitem"]').focus()
}

const closeCiteMenu = () => {
  ui.citeMenu.hidden = true
  ui.citeCopy.setAttribute('aria-expanded', 'false')
}

ui.citeMenu.replaceChildren(...CITE_FORMATS.map(format => {
  const item = el('button', { type: 'button', role: 'menuitem', textContent: format.label })
  item.dataset.format = format.id
  return item
}))

ui.citeMenu.addEventListener('click', async event => {
  const item = event.target.closest('[data-format]')
  if (!item) return
  closeCiteMenu()
  ui.citeCopy.focus()
  try {
    await writeClipboard(cite(selectedPassage(), item.dataset.format))
    showCopyFeedback('Copied')
  } catch {
    showCopyFeedback('Couldn’t copy')
  }
})

ui.citeMenu.addEventListener('keydown', event => {
  const items = [...ui.citeMenu.querySelectorAll('[role="menuitem"]')]
  const index = items.indexOf(document.activeElement)
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus()
  }
})

ui.citeCopy.addEventListener('click', () => (ui.citeMenu.hidden ? openCiteMenu() : closeCiteMenu()))
ui.citeHint.textContent = `${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'}-click to select more`
document.addEventListener('pointerdown', event => {
  if (!ui.citeMenu.hidden && !event.target.closest('.cite-copy-wrap')) closeCiteMenu()
})

// Re-marks the open chapter for a new query without moving its scroll position.
const refreshReaderHighlights = () => {
  ui.readerBody.querySelectorAll('.verse').forEach(verse => {
    verse.querySelector('.verse-text').replaceChildren(highlight(data.text[verse.dataset.id], state.matched))
  })
}

const closeReader = () => {
  state.reader = null
  ui.reader.hidden = true
  document.body.classList.remove('reading')
  ui.results.querySelectorAll('.result.active').forEach(item => item.classList.remove('active'))
  writeUrl()
}

const stepChapter = delta => {
  if (!state.reader) return
  const { book, chapter } = state.reader
  const target = chapter + delta
  if (target >= 1 && target <= book.chapters.length) return openReader(book, target)
  const neighbor = canon.books[book.index + delta]
  if (neighbor) openReader(neighbor, delta > 0 ? 1 : neighbor.chapters.length)
}

ui.readerPrev.addEventListener('click', () => stepChapter(-1))
ui.readerNext.addEventListener('click', () => stepChapter(1))
ui.readerClose.addEventListener('click', closeReader)

const openResult = item => {
  const start = Number(item.dataset.id)
  openPassage({ start, end: item.dataset.end ? Number(item.dataset.end) : start + 1 })
}

ui.results.addEventListener('click', event => {
  if (event.target.closest('.result-link')) return
  const item = event.target.closest('.result')
  if (item) openResult(item)
})

// ---- Input & keyboard --------------------------------------------------------------------------------------

ui.query.addEventListener('input', () => {
  state.query = ui.query.value
  writeUrl()
  runSearch()
})

ui.order.addEventListener('click', event => {
  const button = event.target.closest('[data-order]')
  if (!button) return
  state.order = button.dataset.order
  syncOrder()
  writeUrl()
  runSearch()
})

ui.mode.addEventListener('click', event => {
  const button = event.target.closest('[data-mode]')
  if (!button || button.dataset.mode === state.mode) return
  state.mode = button.dataset.mode
  syncMode()
  if (state.mode === 'meaning') getSemanticWorker()
  writeUrl()
  runSearch()
})

const syncMode = () => {
  ui.mode.querySelectorAll('[data-mode]').forEach(button => {
    button.setAttribute('aria-checked', button.dataset.mode === state.mode)
  })
}

const syncOrder = () => {
  ui.order.querySelectorAll('[data-order]').forEach(button => {
    button.setAttribute('aria-checked', button.dataset.order === state.order)
  })
}

$('examples').addEventListener('click', event => {
  const button = event.target.closest('.example')
  if (!button) return
  state.query = ui.query.value = button.dataset.query
  if (button.dataset.scope) state.scope = new Set([button.dataset.scope])
  scopeChanged()
  ui.query.focus()
})

const isTyping = target => target.matches('input, textarea, [contenteditable]')

document.addEventListener('keydown', event => {
  if (ui.picker.open) return
  const { key, target } = event

  if (key === '/' && !isTyping(target)) {
    event.preventDefault()
    ui.query.focus()
    ui.query.select()
    return
  }

  if (key === 'Escape' && !ui.citeMenu.hidden) {
    // Close just the copy menu, not the whole reader.
    closeCiteMenu()
    ui.citeCopy.focus()
    return
  }

  if (key === 'Escape') {
    if (state.reader) closeReader()
    else if (ui.query.value) {
      ui.query.value = state.query = ''
      writeUrl()
      runSearch()
    }
    ui.query.focus()
    return
  }

  if (target === ui.query && key === 'Enter') {
    const [reference] = findReferences(state.query.trim())
    if (reference) openPassage(reference)
    else ui.results.querySelector('.result')?.focus()
    return
  }

  if (target === ui.query && key === 'ArrowDown') {
    event.preventDefault()
    ui.results.querySelector('.result')?.focus()
    return
  }

  const item = target.closest?.('.result')
  if (item) {
    if (key === 'Enter' || key === ' ') {
      event.preventDefault()
      openResult(item)
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault()
      const sibling = key === 'ArrowDown' ? item.nextElementSibling : item.previousElementSibling
      if (sibling) sibling.focus()
      else if (key === 'ArrowUp') ui.query.focus()
      if (key === 'ArrowDown' && !item.nextElementSibling?.nextElementSibling) renderMore()
    }
    return
  }

  if (state.reader && !isTyping(target) && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    stepChapter(key === 'ArrowLeft' ? -1 : 1)
  }
})

// ---- Start -------------------------------------------------------------------------------------------------

readUrl()
ui.query.value = state.query
syncOrder()
syncMode()
if (state.mode === 'meaning') getSemanticWorker()
buildPicker()
renderWorkChips()
renderCustomChips()
runSearch()
if (state.reader) {
  const { book, chapter, verse, last } = state.reader
  openReader(book, chapter, verse, verse && canon.verseId(book, chapter, last))
}
if (!state.reader) ui.query.focus()

if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('./sw.js')
}
