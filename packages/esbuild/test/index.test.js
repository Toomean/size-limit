let SizeLimitError = require('size-limit/size-limit-error')
let { writeFile, readFile, mkdir } = require('fs').promises
let { existsSync } = require('fs')
let { join } = require('path')
let rm = require('size-limit/rm')

let [esbuild] = require('..')
let [file] = require('../../file')

const ROOT_CONFIG = join(__dirname, '..', '..', '.size-limit.json')
const DIST = join(process.cwd(), 'dist')

function fixture(name) {
  return join(__dirname, 'fixtures', name)
}

async function run(config) {
  try {
    await esbuild.before(config)
    await esbuild.step20(config, config.checks[0])
    await esbuild.step40(config, config.checks[0])
    await file.step60(config, config.checks[0])
    await esbuild.step61(config, config.checks[0])
  } finally {
    await esbuild.finally(config, config.checks[0])
  }
}

afterEach(async () => {
  await rm(DIST)
  jest.clearAllMocks()
})

it('uses esbuild to make bundle', async () => {
  let config = {
    checks: [{ files: [fixture('big.js')] }]
  }
  await run(config)
  expect(config).toEqual({
    checks: [
      {
        files: [fixture('big.js')],
        esbuildOutfile: config.checks[0].esbuildOutfile,
        esbuildConfig: config.checks[0].esbuildConfig,
        bundles: [join(config.checks[0].esbuildOutfile, 'big.js')],
        size: 1836
      }
    ]
  })
  expect(config.checks[0].esbuildOutfile).toContain('size-limit-')
  expect(typeof config.checks[0].esbuildConfig).toBe('object')
  expect(existsSync(config.checks[0].esbuildOutfile)).toBe(false)
})

it('supports ignore', async () => {
  let config = {
    checks: [{ files: fixture('big.js'), ignore: ['redux'] }]
  }
  await run(config)
  expect(config.checks[0].size).toBe(273)
})

it('supports custom esbuild config', async () => {
  let config = {
    configPath: ROOT_CONFIG,
    checks: [{ config: fixture('esbuild.config.js') }]
  }
  await run(config)
  expect(config.checks[0].size).toBe(162)
})

it('supports custom entry', async () => {
  let config = {
    configPath: ROOT_CONFIG,
    checks: [{ config: fixture('esbuild.config.js'), entry: ['small'] }]
  }
  await run(config)
  expect(config.checks[0].size).toBe(82)
})

it('throws error on unknown entry', async () => {
  let config = {
    configPath: ROOT_CONFIG,
    checks: [{ config: fixture('esbuild.config.js'), entry: ['unknown'] }]
  }
  let err
  try {
    await run(config)
  } catch (e) {
    err = e
  }
  expect(err).toEqual(new SizeLimitError('unknownEntry', 'unknown'))
  expect(existsSync(config.checks[0].webpackOutput)).toBe(false)
})

it('allows to disable esbuild', async () => {
  let config = {
    checks: [{ files: [fixture('big.js')], esbuild: false }]
  }
  await run(config)
  expect(config.checks[0].size).toBe(55)
})

it('throws on missed file plugin', async () => {
  let config = {
    checks: [{ files: [fixture('small.js')] }]
  }
  try {
    await esbuild.step20(config, config.checks[0])
    await esbuild.step40(config, config.checks[0])
    let err
    try {
      await esbuild.step61(config, config.checks[0])
    } catch (e) {
      err = e
    }
    expect(err).toEqual(new SizeLimitError('missedPlugin', 'file'))
  } finally {
    await esbuild.finally(config, config.checks[0])
  }
})

// Index.js should be here for a webpack
it('supports --save-bundle', async () => {
  let config = {
    saveBundle: DIST,
    checks: [{ files: [fixture('small.js')] }]
  }
  await run(config)
  expect(existsSync(join(DIST, 'small.js'))).toBe(true)
})

// It also generates outdir instead of index.js bundle
it('supports --clean-dir', async () => {
  let dist = join(DIST, 'small.js')
  let config = {
    saveBundle: DIST,
    cleanDir: true,
    checks: [{ files: [fixture('small.js')] }]
  }

  await run(config)
  expect(existsSync(dist)).toBe(true)

  await esbuild.before(config)
  expect(existsSync(dist)).toBe(false)
})

it('throws error on not empty bundle dir', async () => {
  let dist = join(DIST, 'small.js')
  let config = {
    saveBundle: DIST,
    checks: [{ files: [fixture('small.js')] }]
  }
  await run(config)
  expect(existsSync(dist)).toBe(true)

  let err
  try {
    await run(config)
  } catch (e) {
    err = e
  }

  expect(err).toEqual(new SizeLimitError('bundleDirNotEmpty', DIST))
})

it('throws unsupported error --save-bundle', async () => {
  let distFile = join(DIST, 'small.js')
  let config = {
    saveBundle: distFile,
    checks: [{ files: [fixture('small.js')] }]
  }
  await mkdir(DIST)
  await writeFile(distFile, '')

  let err
  try {
    await run(config)
  } catch (e) {
    err = e
  }
  expect(err.code).toBe('ENOTDIR')
})

it('throws on esbuild error', async () => {
  let config = {
    checks: [{ files: [fixture('unknown.js')] }]
  }
  let err
  try {
    await run(config)
  } catch (e) {
    err = e
  }
  expect(err.message).toContain('unknown.js')
})
