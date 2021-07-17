module.exports = (opts = { classHash }) => {
  const idGen = idGenFactory()
  return {
    postcssPlugin: 'postcss-rename-classes',
    Rule(rule) {
      rule.selectors = rule.selectors.map(selector => {
        if (!selector.includes('.')) return selector
        const re = /\.([_\-a-zA-Z][_\-a-zA-Z0-9]*)/g
        let match
        while ((match = re.exec(selector)) !== null) {
          const [, oldClass] = match
          if (!opts.classHash[oldClass]) opts.classHash[oldClass] = idGen.next().value
          const newClass = opts.classHash[oldClass]
          const { index } = match
          selector = selector.slice(0, index + 1)
            + newClass
            + selector.slice(index + 1 + oldClass.length)
        }
        return selector
      })
    }
  }
}

module.exports.postcss = true

function* idGenFactory() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  const alphabetLen = alphabet.length
  const convert = (val) => {
    if (val < 0) return 0
    var r = val % alphabetLen
    var res = alphabet.charAt(r)
    var q = Math.floor(val / alphabetLen)
    while (q) {
      r = q % alphabetLen;
      q = Math.floor(q / alphabetLen)
      res = alphabet.charAt(r) + res
    }
    return res
  }
  let i = 0
  while (true) {
    yield convert(i++)
  }
}
