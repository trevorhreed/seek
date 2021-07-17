document.addEventListener('DOMContentLoaded', async e => {
  const [data, verses] = await Promise.all([
    fetch('./index.json').then(res => res.json()),
    fetch('./verses.json').then(res => res.json())
  ])
  const index = elasticlunr.Index.load(data)
  const versesArr = Object.keys(verses).map(x => verses[x])

  let queryTokens = []
  let references = []
  let selectedWork
  const [
    searchEl,
    main,
    workEls,
    resultsEl,
    resultsStatusEl,
    resultsScrollWrapperEl,
    resultsListEl,
    loadingEl,
    chapterEl,
    closeChapterEl,
    versesEl,
    resultTemplate,
    verseTemplate
  ] = querySelector(
    '.search input',
    'main',
    ['.works div'],
    '.results',
    '.results .status',
    '.results .scroll-wrapper',
    '.results .list',
    '.loading',
    '.chapter',
    '.close-chapter',
    '.verses',
    '#result',
    '#verse'
    )

  const collectVerses = (work, book, chapter) => {
    return versesArr.filter(verse => {
      return verse.work === work
        && verse.book === book
        && verse.chapter === chapter
    })
  }

  const clearVerses = () => {
    while (versesEl.lastChild) {
      versesEl.lastChild.remove()
    }
  }

  const showChapter = ({ work, book, chapter, selectedVerse }) => {
    clearVerses()
    versesEl.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
    chapterEl.querySelector('h2').textContent = `${book} ${chapter}`
    const verses = collectVerses(work, book, chapter)
    let highlight
    verses.forEach(verse => {
      const template = verseTemplate.content.cloneNode(true).firstChild
      template.querySelector('.num').textContent = verse.verse
      template.querySelector('.text').textContent = verse.text
      if (verse.verse === selectedVerse) {
        template.id = 'highlight'
        template.classList.add('highlight')
        highlight = template
      }
      versesEl.append(template)
    })
    chapterEl.classList.add('open')
    highlight.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const hideChapter = () => {
    chapterEl.classList.remove('open')
  }

  const removeResult = (element) => {
    element.removeEventListener('click', onResultClick)
    element.remove()
  }

  const addResult = (result) => {
    const template = resultTemplate.content.cloneNode(true).firstChild
    template.querySelector('h3 span').textContent = result.ref
    let text = result.text
    queryTokens.forEach(token => {
      const re = new RegExp(`\\b${token}\\b`, 'ig')
      text = text.replace(re, m => `<span class="highlight">${m}</span>`)
    })
    template.querySelector('p').innerHTML = text
    template.dataset.work = result.work
    template.dataset.book = result.book
    template.dataset.chapter = result.chapter
    template.dataset.verse = result.verse
    template.setAttribute('tabindex', resultsListEl.children.length + 1)
    template.addEventListener('click', onResultClick, true)
    resultsListEl.append(template)
  }

  const emptyResultsList = () => {
    while (resultsListEl.lastChild) {
      removeResult(resultsListEl.lastChild)
    }
  }

  const clearResults = () => {
    loadingEl.style.display = 'none'
    queryTokens = []
    references = []
    emptyResultsList()
    hideChapter()
    resultsStatusEl.textContent = `No results.`
  }

  let offset = 0
  const pageSize = 10
  const updateResults = (resetOffset) => {
    if (resetOffset) {
      offset = 0
      resultsScrollWrapperEl.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
      emptyResultsList()
      resultsStatusEl.textContent = `Found ${references.length} result(s).`
    }
    if (!queryTokens.length) return
    loadingEl.style.display = 'flex'
    let count = 0
    let collector = []
    for (let l = references.length; offset < l && count < pageSize; offset++) {
      const verse = verses[references[offset].ref]
      if (selectedWork && verse.work !== selectedWork) continue
      collector.push(verse)
      count++
    }
    collector.forEach(addResult)
    if (offset >= references.length) {
      loadingEl.style.display = 'none'
    }
  }

  const search = debounce(query => {
    clearResults()
    if (query) {
      queryTokens = query.split(/[^a-zA-Z]+/).filter(Boolean)
      queryTokens.sort((a, b) => {
        if (a.length > b.length) return -1
        if (a.length < b.length) return 1
        return 0
      })
      references = index.search(query)
      updateResults(true)
    }
  })


  ///////////////////////////////////////////////////////////////
  //  Event Handlers
  //

  function onResultClick(e) {
    const result = e.target.closest('.result')
    const { work, book, chapter, verse } = result.dataset
    showChapter({ work, book, chapter, selectedVerse: verse })
  }

  const onSearchInput = e => {
    search(e.target.value)
  }

  const onWorkClick = e => {
    workEls.forEach(workEl => {
      if (workEl === e.target) return
      workEl.classList.remove('selected')
    })
    e.target.classList.toggle('selected')
    selectedWork = e.target.classList.contains('selected')
      ? e.target.dataset.name
      : null
    updateResults(true)
  }

  const onDocKeyDown = e => {
    if (e.key === '/' && e.target !== searchEl) {
      searchEl.focus()
      searchEl.select()
      e.preventDefault()
    } else if (e.key === 'Escape') {
      clearResults()
      searchEl.value = ''
      searchEl.focus()
    } else if (e.key === 'Enter') {
      if (document.activeElement.classList.contains('result')) {
        document.activeElement.click()
      }
    }
  }

  const onScroll = e => {
    updateResults()
  }

  ///////////////////////////////////////////////////////////////
  //  Event Wiring
  //

  searchEl.addEventListener('input', onSearchInput)
  workEls.forEach(workEl => workEl.addEventListener('click', onWorkClick))
  closeChapterEl.addEventListener('click', hideChapter)
  document.addEventListener('keydown', onDocKeyDown)
  const observer = new IntersectionObserver(onScroll, { root: main, threshold: 0 })
  observer.observe(loadingEl)


  ///////////////////////////////////////////////////////////////
  //  Initialize UI
  //

  searchEl.focus()
})


function querySelector(...selectors) {
  return selectors.map(selector => {
    if (typeof selector === 'string') {
      return document.querySelector(selector)
    } else if (Array.isArray(selector)) {
      return Array.from(document.querySelectorAll(selector[0]))
    }
  })
}

function debounce (func, timeout = 300) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => func.apply(this, args), timeout)
  }
}
