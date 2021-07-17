const fs = require('fs')
const { dirname } = require('path')
const mkdirp = require('mkdirp')


module.exports.read = filename => {
  return new Promise((resolve, reject) => {
    fs.readFile(filename, (err, data) => {
      if (err) return reject(err)
      resolve(data.toString())
    })
  })
}

module.exports.write = (filename, data) => {
  return new Promise(async (resolve, reject) => {
    if (typeof data !== 'string') data = JSON.stringify(data)
    const dir = dirname(filename)
    await mkdirp(dir)
    fs.writeFile(filename, data, err => {
      if (err) return reject(err)
      resolve()
    })
  }).catch(err => {
    console.error(`We've encountered a problem...`)
    console.error(err)
  })
}
