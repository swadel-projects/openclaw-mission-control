import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies before importing the route
vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/db', () => ({
  getDatabase: vi.fn(),
}))

vi.mock('@/lib/event-bus', () => ({
  eventBus: { broadcast: vi.fn(), on: vi.fn(), emit: vi.fn() },
}))

import { POST } from '../route'
import { requireRole } from '@/lib/auth'
import { NextRequest } from 'next/server'

const mockRequireRole = vi.mocked(requireRole)

function createMockRequest(fields?: Record<string, Blob | string>): NextRequest {
  const formData = new FormData()
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      if (value instanceof Blob) {
        formData.append(key, value, 'audio.webm')
      } else {
        formData.append(key, value)
      }
    }
  }

  const request = new NextRequest('http://localhost:3000/api/transcribe', {
    method: 'POST',
  })
  // Override formData() to avoid slow serialization in jsdom
  vi.spyOn(request, 'formData').mockResolvedValue(formData)
  return request
}

function audioBlob(sizeBytes = 1024): Blob {
  return new Blob([new ArrayBuffer(sizeBytes)], { type: 'audio/webm' })
}

describe('/api/transcribe POST', () => {
  const originalEnv = process.env.OPENAI_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-key-123'
    mockRequireRole.mockReturnValue({ user: 'test', role: 'operator' } as never)
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.OPENAI_API_KEY = originalEnv
    } else {
      delete process.env.OPENAI_API_KEY
    }
    vi.restoreAllMocks()
  })

  it('returns auth error when requireRole fails', async () => {
    mockRequireRole.mockReturnValue({ error: 'Unauthorized', status: 401 } as never)

    const request = createMockRequest({ audio: audioBlob() })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 400 when no audio field is provided', async () => {
    const request = createMockRequest({})
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('No audio file provided')
  })

  it('returns 500 when OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY

    const request = createMockRequest({ audio: audioBlob() })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBe('OPENAI_API_KEY not configured')
  })

  it('returns 413 when audio file exceeds 25MB', async () => {
    // Build a FormData with a fake large blob directly
    const largeBlob = audioBlob(1024)
    Object.defineProperty(largeBlob, 'size', { value: 26 * 1024 * 1024 })

    const formData = new FormData()
    formData.append('audio', largeBlob, 'audio.webm')

    // Override formData.get to return our blob with the spoofed size
    const originalGet = formData.get.bind(formData)
    vi.spyOn(formData, 'get').mockImplementation((name: string) => {
      if (name === 'audio') return largeBlob as unknown as FormDataEntryValue
      return originalGet(name)
    })

    const request = new NextRequest('http://localhost:3000/api/transcribe', {
      method: 'POST',
    })
    vi.spyOn(request, 'formData').mockResolvedValue(formData)

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(413)
    expect(body.error).toBe('Audio file too large')
  })

  it('returns 200 with transcribed text on success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ text: 'hello world' }), { status: 200 })
    )

    const request = createMockRequest({ audio: audioBlob() })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.text).toBe('hello world')
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/transcriptions',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('returns 502 when OpenAI returns an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Rate limit exceeded', { status: 429 })
    )

    const request = createMockRequest({ audio: audioBlob() })
    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.error).toBe('Transcription failed')
  })
})
