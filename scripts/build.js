#!/usr/bin/env node
// Copies src/ to dist/ and stamps the service worker with a content hash, so each deploy gets a fresh cache.

import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const DIST = join(ROOT, 'dist')
const SW = join(DIST, 'sw.js')
const VERSION_PLACEHOLDER = '__BUILD_VERSION__'
const ASSETS_PLACEHOLDER = '__BUILD_ASSETS__'
// Large files only meaning search uses; sw.js caches them on first use instead of precaching them.
const CACHE_ON_USE = ['data/vectors.bin']

const listFiles = async dir => (await readdir(dir, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile())
  .map(entry => join(entry.parentPath, entry.name))

await rm(DIST, { recursive: true, force: true })
await cp(SRC, DIST, { recursive: true })

const files = (await listFiles(DIST)).filter(file => file !== SW).sort()
const hash = createHash('sha256')
for (const file of files) hash.update(await readFile(file))
const assets = files
  .map(file => file.slice(DIST.length + 1).replaceAll('\\', '/'))
  .filter(path => !CACHE_ON_USE.includes(path))
  .map(path => `./${path}`)

const sw = await readFile(SW, 'utf8')
await writeFile(SW, sw
  .replace(VERSION_PLACEHOLDER, hash.digest('hex').slice(0, 12))
  .replace(`'${ASSETS_PLACEHOLDER}'`, JSON.stringify(['./', ...assets])))
console.log(`Built ${files.length} files into ${DIST}`)
