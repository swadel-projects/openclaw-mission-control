import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('Dispatch health endpoint', () => {
  test('GET /api/dispatch/health returns expected shape', async ({ request }) => {
    const res = await request.get('/api/dispatch/health', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)

    const body = await res.json()

    // Gateway section
    expect(body.gateway).toBeDefined()
    expect(typeof body.gateway.available).toBe('boolean')

    // Direct API section
    expect(body.directApi).toBeDefined()
    expect(typeof body.directApi.configured).toBe('boolean')

    // Agents section
    expect(body.agents).toBeDefined()
    expect(typeof body.agents.total).toBe('number')
    expect(typeof body.agents.online).toBe('number')
    expect(typeof body.agents.offline).toBe('number')

    // Pipeline section
    expect(body.pipeline).toBeDefined()
    expect(typeof body.pipeline.inbox_unrouted).toBe('number')
    expect(typeof body.pipeline.assigned_pending).toBe('number')
    expect(typeof body.pipeline.in_progress_stale).toBe('number')
    expect(typeof body.pipeline.review_pending).toBe('number')
    expect(typeof body.pipeline.failed).toBe('number')

    // Issues array
    expect(Array.isArray(body.issues)).toBe(true)
  })

  test('pipeline counts are non-negative', async ({ request }) => {
    const res = await request.get('/api/dispatch/health', { headers: API_KEY_HEADER })
    const body = await res.json()

    for (const [key, value] of Object.entries(body.pipeline)) {
      expect(value).toBeGreaterThanOrEqual(0)
    }
  })

  test('agent counts are consistent', async ({ request }) => {
    const res = await request.get('/api/dispatch/health', { headers: API_KEY_HEADER })
    const body = await res.json()

    expect(body.agents.online + body.agents.offline).toBe(body.agents.total)
  })
})
