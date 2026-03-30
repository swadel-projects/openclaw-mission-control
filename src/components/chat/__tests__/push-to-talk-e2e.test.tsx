import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatInput } from '../chat-input'

// --- Mock setup ---
let capturedOptions: {
  onTranscript: (text: string) => void
  onError?: (error: string) => void
} | null = null

let hookState = {
  isRecording: false,
  isTranscribing: false,
  isSupported: true,
}

const mockStartRecording = vi.fn()
const mockStopRecording = vi.fn()

vi.mock('@/hooks/use-push-to-talk', () => ({
  usePushToTalk: vi.fn((opts: { onTranscript: (t: string) => void; onError?: (e: string) => void }) => {
    capturedOptions = opts
    return {
      ...hookState,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
    }
  }),
}))

vi.mock('@/lib/client-logger', () => ({
  createClientLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}))

const mockSetChatInput = vi.fn()
let mockChatInput = ''

vi.mock('@/store', () => ({
  useMissionControl: vi.fn(() => ({
    chatInput: mockChatInput,
    setChatInput: mockSetChatInput,
    isSendingMessage: false,
  })),
}))

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img {...props} />,
}))

describe('Push-to-Talk E2E flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOptions = null
    mockChatInput = ''
    hookState = { isRecording: false, isTranscribing: false, isSupported: true }
  })

  it('full flow: mouseDown → recording → mouseUp → transcript appears in input', () => {
    render(<ChatInput onSend={vi.fn()} />)

    const micBtn = screen.getByTitle('Hold to record')

    // User presses mic button
    fireEvent.mouseDown(micBtn)
    expect(mockStartRecording).toHaveBeenCalledTimes(1)

    // User releases mic button
    fireEvent.mouseUp(micBtn)
    expect(mockStopRecording).toHaveBeenCalledTimes(1)

    // Hook calls onTranscript after transcription completes
    expect(capturedOptions).toBeTruthy()
    capturedOptions!.onTranscript('hello from voice')

    expect(mockSetChatInput).toHaveBeenCalledWith('hello from voice')
  })

  it('transcript appends to existing draft text', () => {
    mockChatInput = 'already typed'
    render(<ChatInput onSend={vi.fn()} />)

    capturedOptions!.onTranscript('more text')
    expect(mockSetChatInput).toHaveBeenCalledWith('already typed more text')
  })

  it('disabled state prevents interaction (button is disabled)', () => {
    render(<ChatInput onSend={vi.fn()} disabled />)

    const micBtn = screen.getByTitle('Hold to record')
    expect(micBtn).toBeDisabled()
  })

  it('transcription error does not crash the component', () => {
    render(<ChatInput onSend={vi.fn()} />)

    // onError is optional — calling it should not throw
    expect(() => {
      capturedOptions!.onError?.('Some error')
    }).not.toThrow()

    // Component is still functional
    expect(screen.getByTitle('Hold to record')).toBeInTheDocument()
  })

  it('multiple sequential recordings work correctly', () => {
    render(<ChatInput onSend={vi.fn()} />)

    const micBtn = screen.getByTitle('Hold to record')

    // First recording
    fireEvent.mouseDown(micBtn)
    fireEvent.mouseUp(micBtn)
    expect(mockStartRecording).toHaveBeenCalledTimes(1)
    expect(mockStopRecording).toHaveBeenCalledTimes(1)

    // Second recording
    fireEvent.mouseDown(micBtn)
    fireEvent.mouseUp(micBtn)
    expect(mockStartRecording).toHaveBeenCalledTimes(2)
    expect(mockStopRecording).toHaveBeenCalledTimes(2)
  })
})
