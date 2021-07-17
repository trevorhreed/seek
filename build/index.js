#!/usr/bin/env node

const { dirname, resolve } = require('path')
const terser = require('terser')
const jsdom = require('jsdom')
const postcss = require('postcss')
const nestedcss = require('postcss-nested')
// const renameClasses = require('./postcss-rename-classes')
const cssnano = require('cssnano')
const htmlMinifier = require('html-minifier')
const chokidar = require('chokidar')
const { read, write } = require('./utils.js')


const getBasePath = (src, dom) => {
  const srcDir = dirname(src)
  const base = dom.window.document.querySelector('base[href]')
  const baseUrl = base ? base.getAttribute('href') : null
  return baseUrl !== null
    ? resolve(srcDir, baseUrl)
    : srcDir
}

const minify = module.exports.minify = async ({ src, dest }) => {
  const dom = new jsdom.JSDOM(await read(src), { virtualConsole: new jsdom.VirtualConsole() })
  const doc = dom.window.document
  const root = getBasePath(src, dom)

  // const classHash = {}

  const cssMinifier = postcss([nestedcss, cssnano])
  const cssPromise = Promise
    .all(
      Array
        .from(doc.querySelectorAll('link[rel="stylesheet"]'))
        .map(async styleLink => {
          const path = resolve(root, styleLink.getAttribute('href'))
          const css = await read(path)
          const style = doc.createElement('style')
          style.setAttribute('path', path)
          style.textContent = css
          styleLink.replaceWith(style)
        })
    )
    .then(async () => {
      const styles = await Promise.all(
        Array
          .from(doc.querySelectorAll('style'))
          .map(async style => {
            const path = style.getAttribute('path')
            const result = await cssMinifier.process(style.textContent, { from: path })
            style.remove()
            return result.css
          })
      )
      const css = styles.join(' ')
      // const result = await postcss([renameClasses({ classHash })]).process(css, { from: undefined })
      const style = doc.createElement('style')
      style.textContent = css
      doc.head.append(style)
    })


  const jsPromise = Promise
    .all(
      Array
        .from(doc.querySelectorAll('script[src]'))
        .map(async script => {
          const path = resolve(root, script.getAttribute('src'))
          script.textContent = await read(path)
          script.removeAttribute('src')
        })
    )
    .then(async () => {
      const code = Array
        .from(doc.querySelectorAll('script'))
        .map(script => {
          const text = script.textContent
          script.remove()
          return text
        })
        .join(';')
      const script = doc.createElement('script')
      const result = await terser.minify(code, { toplevel: true })
      script.textContent = result.code
      doc.body.append(script)
    })


  await Promise.all([cssPromise, jsPromise])

  // Object
  //   .keys(classHash)
  //   .forEach(oldClass => {
  //     const newClass = classHash[oldClass]
  //     const elements = doc.querySelectorAll(`.${oldClass}`)
  //     elements.forEach(element => {
  //       element.classList.remove(oldClass)
  //       element.classList.add(newClass)
  //     })
  //   })

  const html = htmlMinifier.minify(dom.serialize(), {
    collapseWhitespace: true,
    removeComments: true
  })

  await write(dest, html)
}


if(module === require.main) {
  const src = process.argv[2] || './src/index.html'
  const dest = process.argv[3] || './dist/index.html'
  const watch = process.argv[4] === 'watch'
  try {
    if (watch) {
      const srcGlob = resolve(dirname(src), '**')
      const update = path => minify({ src, dest })
      chokidar
        .watch(srcGlob)
        .on('change', update)
        .on(' unlink', update)
        .on('add', update)
    } else {
      minify({ src, dest })
    }
  } catch (err) {
    console.error(err)
  }
}
