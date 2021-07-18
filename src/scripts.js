document.addEventListener('DOMContentLoaded', async e => {
  const [data, verses] = await Promise.all([
    fetch('./index.json').then(res => res.json()),
    fetch('./verses.json').then(res => res.json())
  ])
  const index = elasticlunr.Index.load(data)
  const versesArr = Object.keys(verses).map(x => verses[x])

  const linkInfo = {
    baseUrl: 'https://www.churchofjesuschrist.org/study/scriptures',
    workMap: {
      'The Old Testament': 'ot',
      'The New Testament': 'nt',
      'Book of Mormon': 'bofm',
      'Doctrine & Covenants': 'dc-testament',
      'The Pearl of Great Price': 'pgp'
    },
    bookMap: {
      '1 Nephi': '1-ne',
      '2 Nephi': '2-ne',
      'Jacob': 'jacob',
      'Enos': 'enos',
      'Jarom': 'jarom',
      'Omni': 'omni',
      'Words of Mormon': 'w-of-m',
      'Mosiah': 'mosiah',
      'Alma': 'alma',
      'Helaman': 'hel',
      '3 Nephi': '3-ne',
      '4 Nephi': '4-ne',
      'Mormon': 'morm',
      'Ether': 'ether',
      'Moroni': 'moro',
      'D&C': 'dc',
      'Genesis': 'gen',
      'Exodus': 'ex',
      'Leviticus': 'lev',
      'Numbers': 'num',
      'Deuteronomy': 'deut',
      'Joshua': 'josh',
      'Judges': 'judg',
      'Ruth': 'ruth',
      '1 Samuel': '1-sam',
      '2 Samuel': '2-sam',
      '1 Kings': '1-kgs',
      '2 Kings': '2-kgs',
      '1 Chronicles': '1-chr',
      '2 Chronicles': '2-chr',
      'Ezra': 'ezra',
      'Nehemiah': 'neh',
      'Esther': 'esth',
      'Job': 'job',
      'Psalms': 'ps',
      'Proverbs': 'prov',
      'Ecclesiastes': 'eccl',
      'Solomon\'s Song': 'song',
      'Isaiah': 'isa',
      'Jeremiah': 'jer',
      'Lamentations': 'lam',
      'Ezekiel': 'ezek',
      'Daniel': 'dan',
      'Hosea': 'hosea',
      'Joel': 'joel',
      'Amos': 'amos',
      'Obadiah': 'obad',
      'Jonah': 'jonah',
      'Micah': 'micah',
      'Nahum': 'nahum',
      'Habakkuk': 'hab',
      'Zephaniah': 'zeph',
      'Haggai': 'hag',
      'Zechariah': 'zech',
      'Malachi': 'mal',
      'Matthew': 'matt',
      'Mark': 'mark',
      'Luke': 'luke',
      'John': 'john',
      'Acts': 'acts',
      'Romans': 'rom',
      '1 Corinthians': '1-cor',
      '2 Corinthians': '2-cor',
      'Galatians': 'gal',
      'Ephesians': 'eph',
      'Philippians': 'philip',
      'Colossians': 'col',
      '1 Thessalonians': '1-thes',
      '2 Thessalonians': '2-thes',
      '1 Timothy': '1-tim',
      '2 Timothy': '2-tim',
      'Titus': 'titus',
      'Philemon': 'philem',
      'Hebrews': 'heb',
      'James': 'james',
      '1 Peter': '1-pet',
      '2 Peter': '2-pet',
      '1 John': '1-jn',
      '2 John': '2-jn',
      '3 John': '3-jn',
      'Jude': 'jude',
      'Revelation': 'rev',
      'Moses': 'moses',
      'Abraham': 'abr',
      'Joseph Smith—Matthew': 'js-m',
      'Joseph Smith—History': 'js-h',
      'Articles of Faith': 'a-of-f'
    }
  }

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
    '.search',
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
    const anchor = template.querySelector('a')
    anchor.href = `${linkInfo.baseUrl}/${linkInfo.workMap[result.work]}/${linkInfo.bookMap[result.book]}/${result.chapter}.${result.verse}#${result.verse},`
    anchor.target = '_blank'
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
    if (e.target.tagName === 'A') return
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
