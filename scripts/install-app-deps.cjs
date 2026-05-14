const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

function fail(message) {
  console.error(`[native-rebuild] ${message}`)
  process.exit(1)
}

function log(message) {
  console.log(`[native-rebuild] ${message}`)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options
  })

  if (result.error) {
    throw result.error
  }

  return result
}

function runElectronBuilderDirect(workspaceRoot, env = process.env) {
  const electronBuilderBin = path.join(
    workspaceRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron-builder.CMD' : 'electron-builder'
  )

  if (!fs.existsSync(electronBuilderBin)) {
    fail(`electron-builder executable not found at ${electronBuilderBin}`)
  }

  const result = run(electronBuilderBin, ['install-app-deps'], {
    cwd: workspaceRoot,
    env,
    stdio: 'inherit'
  })

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

function withTempBatchFile(prefix, contents, fn) {
  const batchFile = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}.cmd`)
  fs.writeFileSync(batchFile, contents, 'utf8')

  try {
    return fn(batchFile)
  } finally {
    fs.rmSync(batchFile, { force: true })
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function getTempDir() {
  const localAppData = process.env.LOCALAPPDATA
  if (localAppData) {
    const dir = path.join(localAppData, 'Temp')
    ensureDir(dir)
    return dir
  }

  const fallback = os.tmpdir()
  ensureDir(fallback)
  return fallback
}

function mergeClFlags(existing) {
  const normalized = (existing || '').trim()
  if (!normalized) {
    return '/nologo'
  }

  if (normalized.toLowerCase().includes('/nologo')) {
    return normalized
  }

  return `${normalized} /nologo`
}

function findVsDevCmd() {
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const vswhere = path.join(programFilesX86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe')

  if (!fs.existsSync(vswhere)) {
    fail(`vswhere.exe not found at ${vswhere}`)
  }

  const result = run(
    vswhere,
    [
      '-latest',
      '-products',
      '*',
      '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-find',
      'Common7\\Tools\\VsDevCmd.bat'
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )

  if (result.status !== 0) {
    fail(result.stderr.trim() || 'Unable to locate Visual Studio Build Tools')
  }

  const vsDevCmd = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  if (!vsDevCmd || !fs.existsSync(vsDevCmd)) {
    fail('Visual Studio Build Tools were not found')
  }

  return vsDevCmd
}

function captureVsEnv(vsDevCmd, tempDir) {
  const baseEnv = {
    ...process.env,
    TEMP: tempDir,
    TMP: tempDir,
    CL: mergeClFlags(process.env.CL)
  }

  const script = [
    '@echo off',
    `set "TEMP=${tempDir}"`,
    `set "TMP=${tempDir}"`,
    `set "CL=${baseEnv.CL}"`,
    `call "${vsDevCmd}" -arch=x64 >nul`,
    'set'
  ].join('\r\n')

  const result = withTempBatchFile('native-rebuild-env', script, (batchFile) =>
    run('cmd.exe', ['/d', '/c', batchFile], {
      env: baseEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    })
  )

  if (result.status !== 0) {
    fail(result.stderr.trim() || 'Unable to initialize Visual Studio build environment')
  }

  const env = {}
  for (const line of result.stdout.split(/\r?\n/)) {
    const separator = line.indexOf('=')
    if (separator <= 0) {
      continue
    }

    const key = line.slice(0, separator)

    env[key] = line.slice(separator + 1)
  }

  return env
}

function runElectronBuilder(workspaceRoot, env) {
  const electronBuilderCmd = path.join(workspaceRoot, 'node_modules', '.bin', 'electron-builder.CMD')
  const script = ['@echo off', `call "${electronBuilderCmd}" install-app-deps`].join('\r\n')

  const result = withTempBatchFile('native-rebuild-run', script, (batchFile) =>
    run('cmd.exe', ['/d', '/c', batchFile], {
      cwd: workspaceRoot,
      env,
      stdio: 'inherit'
    })
  )

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

function removeBrokenCpuFeaturesArtifacts(workspaceRoot) {
  const packageDirs = []
  const pnpmDir = path.join(workspaceRoot, 'node_modules', '.pnpm')
  if (!fs.existsSync(pnpmDir)) {
    return packageDirs
  }

  for (const entry of fs.readdirSync(pnpmDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('cpu-features@')) {
      continue
    }

    const artifact = path.join(
      pnpmDir,
      entry.name,
      'node_modules',
      'cpu-features',
      'buildcheck.gypi'
    )
    const packageDir = path.dirname(artifact)
    packageDirs.push(packageDir)

    if (!fs.existsSync(artifact)) {
      continue
    }

    const stat = fs.statSync(artifact)
    if (stat.size === 0) {
      fs.rmSync(artifact, { force: true })
      log(`Removed stale ${artifact}`)
    }
  }

  return packageDirs
}

function prepareCpuFeaturesBuildcheck(packageDirs, env) {
  for (const packageDir of packageDirs) {
    const buildcheckScript = path.join(packageDir, 'buildcheck.js')
    const outputFile = path.join(packageDir, 'buildcheck.gypi')

    if (!fs.existsSync(buildcheckScript)) {
      continue
    }

    const result = run(process.execPath, [buildcheckScript], {
      cwd: packageDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    if (result.status !== 0) {
      fail(result.stderr.trim() || `Failed to generate buildcheck.gypi in ${packageDir}`)
    }

    const contents = result.stdout.trim()
    if (!contents) {
      fail(`buildcheck.js produced empty output in ${packageDir}`)
    }

    try {
      JSON.parse(contents)
    } catch (error) {
      fail(`buildcheck.js produced invalid JSON in ${packageDir}: ${error.message}`)
    }

    fs.writeFileSync(outputFile, `${result.stdout.replace(/\s*$/, '')}\n`, 'utf8')
    log(`Generated ${outputFile}`)
  }
}

function main() {
  const workspaceRoot = process.cwd()

  if (process.platform !== 'win32') {
    log(`Using direct native dependency install on ${process.platform}`)
    runElectronBuilderDirect(workspaceRoot)
    return
  }

  const tempDir = getTempDir()
  const vsDevCmd = findVsDevCmd()

  log(`Using temp directory: ${tempDir}`)
  log(`Using Visual Studio environment: ${vsDevCmd}`)

  const env = captureVsEnv(vsDevCmd, tempDir)
  const cpuFeatureDirs = removeBrokenCpuFeaturesArtifacts(workspaceRoot)
  prepareCpuFeaturesBuildcheck(cpuFeatureDirs, env)
  runElectronBuilder(workspaceRoot, env)
}

main()
