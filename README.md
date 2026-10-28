# seek

An application for searching the scriptures: every verse of the Old and New Testaments, Book of Mormon, Doctrine and Covenants and Pearl of Great Price, indexed in the browser. Live at https://trevorhreed.github.io/seek/.

No dependencies; needs Node 22+.

```sh
npm start   # generate src/data/scriptures.json and serve src/ at http://localhost:8080
npm test    # search, stemming and reference parsing tests
npm run build   # copy the app into dist/ for deployment
```

`data/verses.json` is the source text. `scripts/build-data.js` turns it into the compact file the app loads, and a Web Worker (`src/worker.js`) builds the search index from it on page load. Search collections like "Isaiah, wherever quoted" live in `src/lib/collections.js` as lists of references.

Pushes to `main` deploy through `.github/workflows/pages.yml`.
