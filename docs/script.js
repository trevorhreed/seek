(async () => {

  const searchSplitRegex = /[\s\b]+/g
  const alphaOnlyRegex = /[^a-z\s]/g
  const verseAndChapterRegex = /(.+?)(\d+):(:?\d+)$/g
  const [
    indexJson,
    verseMap,
    structure
  ] = await Promise.all([
    fetch('./index.json').then(res => res.json()),
    fetch('./verse-map.json').then(res => res.json()),
    fetch('./structure.json').then(res => res.json())
  ])
  const index = lunr.Index.load(indexJson)
  const verses = []
  Object
    .keys(verseMap)
    .forEach(ref => {
      const [_, book, chapter, verse] = verseAndChapterRegex.exec(ref) || []
      verseMap[ref].book = book
      verseMap[ref].chapter = chapter
      verseMap[ref].verse = verse
      verses.push(verseMap[ref])
    })

  const searchInput = document.querySelector('#search')
  const main = document.querySelector('main')
  const aside = document.querySelector('aside')
  const worksContainer = document.querySelector('#works')
  const books = document.querySelector('#books')
  const resultsEl = document.querySelector('.results')
  const list = document.querySelector('#list')
  const loading = document.querySelector('#loading')
  const close = document.querySelector('#close')

  const templateResult = document.querySelector('#result')
  const templateVerse = document.querySelector('#verse')
  const templateChapter = document.querySelector('#chapter')

  let selectedWork = null
  const workElements = []
  const onWorkClick = e => {
    const { target } = e
    const { work } = target.dataset
    workElements.forEach(div => {
      if (div === target) return
      div.classList.remove('selected')
    })
    const isSelected = target.classList.toggle('selected')
    selectedWork = isSelected ? work : null
    filterResults()
  }
  worksContainer.append(
    ...structure.map(work => {
      const div = document.createElement('DIV')
      div.classList.add('work')
      div.textContent = work.name
      div.dataset.work = work.name
      div.addEventListener('click', onWorkClick)
      workElements.push(div)
      return div
    })
  )


  const filterResults = () => {
    results = unfilteredResults.filter(item => {
      return selectedWork === null || item.work === selectedWork
    })
    updateResults()
  }

  let unfilteredResults = []
  let results = []
  let resultOffset = 0

  const gatherChapter = (book, chapter) => {
    console.dir(verses)
    return verses.filter(x => x.book === book && x.chapter === chapter)
  }

  const clearVerses = () => {
    const versesEl = aside.querySelector('.verses')
    while (versesEl.lastChild) {
      versesEl.removeChild(versesEl.lastChild)
    }
  }

  const composeVerses = verses => {
    return verses.map(verse => {
      const element = templateVerse.cloneNode(true).content
      const num = element.querySelector('.num')
      const text = element.querySelector('.text')
      num.textContent = verse.verse
      text.textContent = verse.text
      return element
    })
  }

  const openChapter = e => {
    clearVerses()
    const { book, chapter } = e.target.dataset
    const verses = gatherChapter(book, chapter)
    const h1 = aside.querySelector('h1')
    h1.textContent = `${book} ${chapter}`
    const versesEl = aside.querySelector('.verses')
    versesEl.append(...composeVerses(verses))
    aside.style.display = 'flex'
  }

  const clearResults = () => {
    selectedWork = null
    unfilteredResults = results = []
    resultOffset = 0
    loading.style.display = 'none'
    while (list.lastChild) {
      list.removeChild(list.lastChild)
    }
  }

  const composeResults = () => {
    const slice = results
      .slice(resultOffset, resultOffset += 10)
      .map(result => {
        const div = templateResult.cloneNode(true).content
        const relevanceEl = div.querySelector('.relevance')
        const linkEl = div.querySelector('.ref')
        const textEl = div.querySelector('.text')
        relevanceEl.textContent = result.relevance
        linkEl.textContent = result.ref
        linkEl.dataset.book = result.book
        linkEl.dataset.chapter = result.chapter
        linkEl.dataset.terms = searchInput.value
        linkEl.addEventListener('click', openChapter)
        textEl.textContent = result.text
        return div
      })
    list.append(...slice)
    if (resultOffset >= results.length) {
      loading.style.display = 'none'
    }
  }

  document.addEventListener('keyup', e => {
    if (e.target.tagName === 'INPUT') return
    if (e.key === '/') {
      searchInput.focus()
      searchInput.select()
    }
  })

  const debounce = (fn, timeout = 300) => {
    let timer
    return (...args) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        fn.apply(this, args)
      }, timeout)
    }
  }

  const handleInput = e => {
    if (!searchInput.value) {
      clearResults()
      loading.style.display = 'none'
    }
    clearResults()
    unfilteredResults = results = index
      .search(searchInput.value)
      .map(({ ref }) => verseMap[ref])
      updateResults()
  }

  const updateResults = () => {
    resultOffset = 0
    loading.style.display = 'none'
    while (list.lastChild) {
      list.removeChild(list.lastChild)
    }
    loading.style.display = 'flex'
    composeResults()
    resultsEl.scrollTo({ top: 0, behavior: 'smooth' })
  }

  searchInput.focus()
  searchInput.addEventListener('keyup', debounce(handleInput))

  close.addEventListener('click', e => {
    aside.style.display = 'none'
    clearVerses()
  })

  const onScroll = () => {
    composeResults()
  }
  const options = {
    root: main,
    threshold: 0
  }
  const observer = new IntersectionObserver(onScroll, options)
  observer.observe(loading)

})()
