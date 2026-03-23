import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePushToTalk } from '../use-push-to-talk'

// Mock client-logger
vi.mock('@/lib/client-logger', () => ({
  createClientLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// --- MediaRecorder mock ---
class MockMediaRecorder {
  state: string = 'inactive'
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null

  constructor(_stream: MediaStream, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType || 'audio/webm'
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    // Simulate a data chunk
    this.ondataavailable?.({ data: new Blob(['audio-data'], { type: this.mimeType }) })
    this.onstop?.()
  }

  static isTypeSupported(type: string) {
    return type === 'audio/webm;codecs=opus'
  }
}

function createMockStream(): MediaStream {
  return {
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream
}

describe('usePushToTalk', () => {
  let originalMediaDevices: MediaDevices | undefined
  let originalMediaRecorder: typeof MediaRecorder | undefined
  let mockGetUserMedia: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })

    originalMediaRecorder = globalThis.MediaRecorder
    globalThis.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder

    mockGetUserMedia = vi.fn().mockResolvedValue(createMockStream())
    originalMediaDevices = navigator.mediaDevices

    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()

    if (originalMediaRecorder) {
      globalThis.MediaRecorder = originalMediaRecorder
    }
    if (originalMediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: originalMediaDevices,
        writable: true,
        configurable: true,
      })
    }
  })

  it('sets isSupported to true when getUserMedia is available', () => {
    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript: vi.fn() }),
    )
    expect(result.current.isSupported).toBe(true)
  })

  it('sets isSupported to false when mediaDevices is undefined', () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript: vi.fn() }),
    )
    expect(result.current.isSupported).toBe(false)
  })

  it('startRecording sets isRecording to true and calls getUserMedia', async () => {
    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript: vi.fn() }),
    )

    await act(async () => {
      await result.current.startRecording()
    })

    expect(result.current.isRecording).toBe(true)
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true })
  })

  it('stopRecording sets isRecording to false', async () => {
    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript: vi.fn() }),
    )

    await act(async () => {
      await result.current.startRecording()
    })
    expect(result.current.isRecording).toBe(true)

    act(() => {
      result.current.stopRecording()
    })
    expect(result.current.isRecording).toBe(false)
  })

  it('discards short recordings (< 500ms) and does NOT call onTranscript', async () => {
    const onTranscript = vi.fn()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript }),
    )

    await act(async () => {
      await result.current.startRecording()
    })

    // Stop immediately (< 500ms)
    act(() => {
      result.current.stopRecording()
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(onTranscript).not.toHaveBeenCalled()
  })

  it('calls onTranscript with text on successful transcription', async () => {
    const onTranscript = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ text: 'hello world' }), { status: 200 }),
    )

    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript, minDurationMs: 0 }),
    )

    await act(async () => {
      await result.current.startRecording()
    })

    await act(async () => {
      result.current.stopRecording()
      // Allow transcribe promise to resolve
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(onTranscript).toHaveBeenCalledWith('hello world')
  })

  it('calls onError when fetch fails', async () => {
    const onTranscript = vi.fn()
    const onError = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript, onError, minDurationMs: 0 }),
    )

    await act(async () => {
      await result.current.startRecording()
    })

    await act(async () => {
      result.current.stopRecording()
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(onError).toHaveBeenCalledWith('Network error')
    expect(onTranscript).not.toHaveBeenCalled()
  })

  it('sets isSupported to false and calls onError on permission denial', async () => {
    const onError = vi.fn()
    const permError = new DOMException('Permission denied', 'NotAllowedError')
    mockGetUserMedia.mockRejectedValueOnce(permError)

    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript: vi.fn(), onError }),
    )

    await act(async () => {
      await result.current.startRecording()
    })

    expect(result.current.isSupported).toBe(false)
    expect(onError).toHaveBeenCalledWith('Microphone permission denied')
  })
})
