import { spawn } from 'node:child_process'
import { config } from './config'

interface CommandOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  input?: string
  onData?: (chunk: string) => void
}

interface CommandResult {
  stdout: string
  stderr: string
  code: number | null
}

export function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false
    })

    let stdout = ''
    let stderr = ''
    let timeoutId: NodeJS.Timeout | undefined

    if (options.timeoutMs) {
      timeoutId = setTimeout(() => {
        child.kill('SIGKILL')
      }, options.timeoutMs)
    }

    child.stdout.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk
      options.onData?.(chunk)
    })

    child.stderr.on('data', (data) => {
      const chunk = data.toString()
      stderr += chunk
      options.onData?.(chunk)
    })

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId)
      reject(error)
    })

    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId)
      if (code === 0) {
        resolve({ stdout, stderr, code })
        return
      }
      const error = new Error(
        `Command failed (${command} ${args.join(' ')}): ${stderr || stdout}`
      )
      ;(error as any).stdout = stdout
      ;(error as any).stderr = stderr
      ;(error as any).code = code
      reject(error)
    })

    if (options.input) {
      child.stdin.write(options.input)
      child.stdin.end()
    }
  })
}

/**
 * Run an OpenClaw CLI command.
 * On Windows, .cmd shims can't be spawned with shell:false (EINVAL),
 * and shell:true mangles JSON args. So we spawn node.exe directly
 * with the openclaw.mjs entry point.
 *
 * The CLI resolves config differently from MC:
 *   CLI: $OPENCLAW_HOME is user home → looks for $HOME/.openclaw/openclaw.json
 *   MC:  OPENCLAW_HOME is the state dir (.openclaw) → looks for $stateDir/openclaw.json
 * We override OPENCLAW_HOME for the child process so the CLI finds the right config.
 */
export function runOpenClaw(args: string[], options: CommandOptions = {}) {
  const isWindows = process.platform === 'win32'
  const openclawEntry = process.env.OPENCLAW_ENTRY
    || (isWindows ? 'C:\\nvm4w\\nodejs\\node_modules\\openclaw\\openclaw.mjs' : '')

  // Explicitly pass OPENCLAW_STATE_DIR so the CLI uses the exact resolved path.
  // Also fix env for child CLI: OPENCLAW_HOME should be user home, not state dir.
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    OPENCLAW_STATE_DIR: config.openclawStateDir,
    OPENCLAW_HOME: process.env.OPENCLAW_CLI_HOME || require('os').homedir(),
    ...options.env,
  }

  if (isWindows && openclawEntry) {
    return runCommand(process.execPath, [openclawEntry, ...args], {
      ...options,
      env: childEnv,
      cwd: options.cwd || config.openclawStateDir || process.cwd()
    })
  }

  return runCommand(config.openclawBin, args, {
    ...options,
    env: childEnv,
    cwd: options.cwd || config.openclawStateDir || process.cwd()
  })
}

export function runClawdbot(args: string[], options: CommandOptions = {}) {
  return runCommand(config.clawdbotBin, args, {
    ...options,
    cwd: options.cwd || config.openclawStateDir || process.cwd()
  })
}
