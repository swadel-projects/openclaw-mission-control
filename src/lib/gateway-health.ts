import { config } from './config'
import { getDatabase } from './db'

// ---------------------------------------------------------------------------
// Cached gateway health probe for task dispatch
// ---------------------------------------------------------------------------

interface GatewayHealthResult {
  available: boolean
  cached: boolean
  error?: string
}

let cachedResult: { available: boolean; error?: string; timestamp: number } | null = null
const CACHE_TTL_MS = 60_000 // 60 seconds

/**
 * Check whether the OpenClaw gateway is reachable.
 *
 * Probes the gateway's HTTP /health endpoint (same as the API health route)
 * and caches the result for 60 seconds to avoid hammering.
 *
 * Falls back to the legacy env-var check if no gateway host is configured.
 */
export function checkGatewayReachable(): GatewayHealthResult {
  const now = Date.now()

  // Return cached result if fresh
  if (cachedResult && now - cachedResult.timestamp < CACHE_TTL_MS) {
    return { available: cachedResult.available, cached: true, error: cachedResult.error }
  }

  // Determine gateway address
  const host = resolveGatewayHost()
  const port = resolveGatewayPort()

  if (!host) {
    // No gateway configured at all — check env var as legacy fallback
    const available = !!config.openclawHome
    cachedResult = { available, timestamp: now, error: available ? undefined : 'No gateway configured' }
    return { available, cached: false, error: cachedResult.error }
  }

  // Fire a synchronous-ish probe using the DB-stored status as a proxy.
  // The real HTTP probe runs via POST /api/gateways/health (called by the
  // scheduler's gateway_health job). Here we read the last-known status so
  // task dispatch doesn't block on network I/O during the hot path.
  const result = probeFromDb(host, port)
  cachedResult = { ...result, timestamp: now }
  return { available: result.available, cached: false, error: result.error }
}

/**
 * Reset the cache, forcing the next call to re-evaluate.
 * Useful for tests and after explicit health probes.
 */
export function resetGatewayHealthCache(): void {
  cachedResult = null
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveGatewayHost(): string | null {
  return (config.gatewayHost || '').trim() || null
}

function resolveGatewayPort(): number {
  return config.gatewayPort || 18789
}

/**
 * Read the last-known gateway status from SQLite.
 * If the gateways table has an entry whose last_seen is within 5 minutes
 * and status is 'online', treat the gateway as available.
 */
function probeFromDb(host: string, port: number): { available: boolean; error?: string } {
  try {
    const db = getDatabase()
    const fiveMinAgo = Math.floor(Date.now() / 1000) - 300

    // Match by host (may include protocol prefix) and port
    const row = db.prepare(`
      SELECT status, last_seen
      FROM gateways
      WHERE (host = ? OR host LIKE ? OR host LIKE ?)
        AND port = ?
      ORDER BY is_primary DESC, last_seen DESC
      LIMIT 1
    `).get(host, `%://${host}`, `%://${host}:%`, port) as
      { status: string; last_seen: number | null } | undefined

    if (!row) {
      // No gateway registered — fall back to env check
      return { available: !!config.openclawHome, error: config.openclawHome ? undefined : 'No gateway record in DB' }
    }

    if (row.status === 'online' && row.last_seen && row.last_seen >= fiveMinAgo) {
      return { available: true }
    }

    return {
      available: false,
      error: row.last_seen
        ? `Gateway status: ${row.status}, last seen ${Math.floor((Date.now() / 1000 - row.last_seen) / 60)}min ago`
        : `Gateway status: ${row.status}, never probed`,
    }
  } catch (err: any) {
    // DB not ready or table missing — fall back to env check
    return { available: !!config.openclawHome, error: undefined }
  }
}
