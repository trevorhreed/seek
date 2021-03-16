(async () => {

  const searchSplitRegex = /[\s\b]+/g
  const alphaOnlyRegex = /[^a-z\s]/g
  const [
    verseJson,
    structure
  ] = await Promise.all([
    fetch('./verses.json').then(res => res.json()),
    fetch('./structure.json').then(res => res.json())
  ])
  const verses = verseJson.map(x => {
    x.lowerText = x.text.toLowerCase().replace(alphaOnlyRegex, '')
    x.lowerTokens = x.lowerText.split(searchSplitRegex).filter(Boolean)
    return x
  })
  const search = document.querySelector('#search')
  const main = document.querySelector('main')
  const aside = document.querySelector('aside')
  const works = document.querySelector('#works')
  const books = document.querySelector('#books')
  const resultsEl = document.querySelector('.results')
  const list = document.querySelector('#list')
  const loading = document.querySelector('#loading')
  const close = document.querySelector('#close')

  const templateResult = document.querySelector('#result')
  const templateVerse = document.querySelector('#verse')
  const templateChapter = document.querySelector('#chapter')

  // works.append(
  //   ...structure.map(work => {
  //     const div = document.createElement('DIV')
  //     div.textContent = work.name
  //     return div
  //   })
  // )

  let results = []
  let resultOffset = 0

  const THRESHOLD = .001
  const EXACT_MATCH_MODIFIER = 1
  const STARTS_WITH_MODIFIER = .9
  const FULL_CONTAINS_MODIFIER = .7
  const PARTIAL_CONTAINS_MODIFIER = .3
  const seek = (term, arr) => {
    term = term.toLowerCase()
    const terms = term.split(searchSplitRegex).filter(Boolean)
    const items = []
    arr.forEach(item => {
      const value = item.lowerText
      const tokens = item.lowerTokens
      const termRatio = terms.length / tokens.length
      const exactMatchScore = EXACT_MATCH_MODIFIER * (value === term ? 1 : 0)
      const startsWithScore = STARTS_WITH_MODIFIER * (value.startsWith(term) ? termRatio : 0)
      const fullContainsScore = FULL_CONTAINS_MODIFIER * (value.includes(term) ? termRatio : 0)
      const partialContainsScore = PARTIAL_CONTAINS_MODIFIER * tokens
        .map(token => {
          const exactMatchCount = EXACT_MATCH_MODIFIER * (terms.filter(x => token === x).length / terms.length)
          const startsWithCount = STARTS_WITH_MODIFIER * (terms.filter(x => token.startsWith(x)).length / terms.length)
          const containsCount = FULL_CONTAINS_MODIFIER * (terms.filter(x => token.includes(x)).length / terms.length)
          return (exactMatchCount + startsWithCount + containsCount) / 3
        })
        .reduce((a, c) => a + c) / tokens.length
      items.push({
        ref: item.ref,
        work: item.work,
        book: item.book,
        chapter: item.chapter,
        verse: item.verse,
        text: item.text,
        relevance: Math.max(
          exactMatchScore,
          startsWithScore,
          fullContainsScore,
          partialContainsScore
        )
      })
    })
    return items
      .filter(x => x.relevance > THRESHOLD)
      .sort((a, b) => {
        if (a.relevance > b.relevance) return -1
        if (a.relevance < b.relevance) return 1
        return 0
      })
  }

  const gatherChapter = (book, chapter) => {
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
    results = []
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
      search.focus()
      search.select()
    }
  })

  function debounce(func, timeout = 300) {
    let timer
    return (...args) => {
      clearTimeout(timer)
      timer = setTimeout(() => { func.apply(this, args) }, timeout)
    }
  }

  const handleInput = e => {
    if (!search.value) {
      clearResults()
      loading.style.display = 'none'
    }
    // if (e.key !== 'Enter') return
    clearResults()
    results = seek(search.value, verses)
    loading.style.display = 'flex'
    composeResults()
    resultsEl.scrollTo({ top: 0, behavior: 'smooth' })
  }

  search.focus()
  search.addEventListener('keyup', e => {
    loading.style.display = 'flex'
    debounce(handleInput)(e)
  })

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
