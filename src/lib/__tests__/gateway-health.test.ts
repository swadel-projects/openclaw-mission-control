import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock config before importing gateway-health
vi.mock('../config', () => ({
  config: {
    openclawHome: '',
    gatewayHost: '127.0.0.1',
    gatewayPort: 18789,
  },
}))

// Mock db
const mockGet = vi.fn()
vi.mock('../db', () => ({
  getDatabase: () => ({
    prepare: () => ({ get: mockGet }),
  }),
}))

import { checkGatewayReachable, resetGatewayHealthCache } from '../gateway-health'
import { config } from '../config'

describe('checkGatewayReachable', () => {
  beforeEach(() => {
    resetGatewayHealthCache()
    mockGet.mockReset()
    ;(config as any).openclawHome = ''
    ;(config as any).gatewayHost = '127.0.0.1'
    ;(config as any).gatewayPort = 18789
  })

  it('returns available when gateway status is online and recent', () => {
    const recentTimestamp = Math.floor(Date.now() / 1000) - 60 // 1 min ago
    mockGet.mockReturnValue({ status: 'online', last_seen: recentTimestamp })

    const result = checkGatewayReachable()
    expect(result.available).toBe(true)
    expect(result.cached).toBe(false)
  })

  it('returns unavailable when gateway status is offline', () => {
    const recentTimestamp = Math.floor(Date.now() / 1000) - 60
    mockGet.mockReturnValue({ status: 'offline', last_seen: recentTimestamp })

    const result = checkGatewayReachable()
    expect(result.available).toBe(false)
    expect(result.error).toContain('offline')
  })

  it('returns unavailable when gateway last_seen is stale (>5 min)', () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 600 // 10 min ago
    mockGet.mockReturnValue({ status: 'online', last_seen: staleTimestamp })

    const result = checkGatewayReachable()
    expect(result.available).toBe(false)
    expect(result.error).toContain('last seen')
  })

  it('returns cached result on second call within TTL', () => {
    const recentTimestamp = Math.floor(Date.now() / 1000) - 60
    mockGet.mockReturnValue({ status: 'online', last_seen: recentTimestamp })

    const first = checkGatewayReachable()
    expect(first.cached).toBe(false)

    const second = checkGatewayReachable()
    expect(second.cached).toBe(true)
    expect(second.available).toBe(true)
    // DB should only be queried once
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('resetGatewayHealthCache forces fresh probe', () => {
    const recentTimestamp = Math.floor(Date.now() / 1000) - 60
    mockGet.mockReturnValue({ status: 'online', last_seen: recentTimestamp })

    checkGatewayReachable()
    resetGatewayHealthCache()
    checkGatewayReachable()

    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('falls back to env check when no gateway host configured', () => {
    ;(config as any).gatewayHost = ''
    ;(config as any).openclawHome = '/some/path'

    const result = checkGatewayReachable()
    expect(result.available).toBe(true)
  })

  it('returns unavailable when no gateway host and no openclawHome', () => {
    ;(config as any).gatewayHost = ''
    ;(config as any).openclawHome = ''

    const result = checkGatewayReachable()
    expect(result.available).toBe(false)
    expect(result.error).toContain('No gateway configured')
  })

  it('falls back to env check when no gateway row in DB', () => {
    mockGet.mockReturnValue(undefined)
    ;(config as any).openclawHome = '/some/path'

    const result = checkGatewayReachable()
    expect(result.available).toBe(true)
  })

  it('handles DB errors gracefully', () => {
    mockGet.mockImplementation(() => { throw new Error('DB locked') })
    ;(config as any).openclawHome = '/some/path'

    const result = checkGatewayReachable()
    // Falls back to env check
    expect(result.available).toBe(true)
  })
})
