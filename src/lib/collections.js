// Curated passage sets for scoping a search across books, e.g. Isaiah wherever it's quoted. Each ref is parsed
// with the same reference parser as the search box, so adding a collection is just adding a list of refs.

export const COLLECTIONS = [
  {
    id: 'isaiah',
    name: 'Isaiah, wherever quoted',
    description: 'Isaiah plus the chapters and verses the Book of Mormon quotes from it.',
    refs: [
      'Isaiah',
      '1 Nephi 20-21',
      '2 Nephi 6:6-7', '2 Nephi 6:16-18', '2 Nephi 7-8', '2 Nephi 9:50-51', '2 Nephi 12-24', '2 Nephi 27',
      '2 Nephi 30:9-15',
      'Mosiah 12:21-24', 'Mosiah 14', 'Mosiah 15:29-31',
      '3 Nephi 16:18-20', '3 Nephi 20:32-45', '3 Nephi 21:8', '3 Nephi 21:29', '3 Nephi 22'
    ]
  },
  {
    id: 'malachi',
    name: 'Malachi, wherever quoted',
    description: 'Malachi plus its quotations in 3 Nephi, the Doctrine and Covenants and Joseph Smith—History.',
    refs: ['Malachi', '3 Nephi 24-25', 'D&C 2', 'D&C 128:17', 'Joseph Smith—History 1:36-39']
  },
  {
    id: 'sermon-on-the-mount',
    name: 'Sermon on the Mount',
    description: 'Matthew 5–7 and its Book of Mormon counterpart, the sermon at the temple in 3 Nephi 12–14.',
    refs: ['Matthew 5-7', '3 Nephi 12-14']
  },
  {
    id: 'ten-commandments',
    name: 'Ten Commandments',
    description: 'Exodus 20, Deuteronomy 5 and Abinadi’s recitation in Mosiah 12–13.',
    refs: ['Exodus 20:1-17', 'Deuteronomy 5:6-21', 'Mosiah 12:34-36', 'Mosiah 13:12-24']
  }
]
