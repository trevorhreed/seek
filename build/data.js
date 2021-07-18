const { write } = require('./utils')
const elastic = require('elasticlunr')
const verses = require('./verses.json')


const index = elastic()
index.setRef('ref')
index.addField('ref')
index.addField('text')
index.saveDocument(false)

const hash = {}

verses.forEach(verse => {
  hash[verse.ref] = verse
  index.addDoc(verse)
})

const generate = async () => {
  await Promise.all([
    write('../docs/index.json', JSON.stringify(index.toJSON())),
    write('../docs/verses.json', JSON.stringify(hash))
  ])
}

// if (module === require.main) {
//   generate()
// }

const data = require('./verses.json')
const books = {}
data.forEach(datum => {
  books[datum.book] = ''
})

write('./books.json', JSON.stringify(books, null, 2))
