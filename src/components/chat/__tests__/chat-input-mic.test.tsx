import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatInput } from '../chat-input'

// Track the onTranscript callback passed to usePushToTalk
let capturedOnTranscript: ((text: string) => void) | null = null

const mockStartRecording = vi.fn()
const mockStopRecording = vi.fn()

const defaultHookReturn = {
  isRecording: false,
  isTranscribing: false,
  isSupported: true,
  startRecording: mockStartRecording,
  stopRecording: mockStopRecording,
}

vi.mock('@/hooks/use-push-to-talk', () => ({
  usePushToTalk: vi.fn((opts: { onTranscript: (text: string) => void }) => {
    capturedOnTranscript = opts.onTranscript
    return defaultHookReturn
  }),
}))

vi.mock('@/lib/client-logger', () => ({
  createClientLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Mock the store
const mockSetChatInput = vi.fn()
let mockChatInput = ''

vi.mock('@/store', () => ({
  useMissionControl: vi.fn(() => ({
    chatInput: mockChatInput,
    setChatInput: mockSetChatInput,
    isSendingMessage: false,
  })),
}))

// Mock next/image to avoid Next.js issues in tests
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

import { usePushToTalk } from '@/hooks/use-push-to-talk'
const mockUsePushToTalk = vi.mocked(usePushToTalk)

describe('ChatInput with MicButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOnTranscript = null
    mockChatInput = ''
    mockUsePushToTalk.mockImplementation((opts) => {
      capturedOnTranscript = opts.onTranscript
      return defaultHookReturn
    })
  })

  it('renders MicButton inside ChatInput when isSupported is true', () => {
    render(<ChatInput onSend={vi.fn()} />)
    // MicButton renders a button with title "Hold to record"
    expect(screen.getByTitle('Hold to record')).toBeInTheDocument()
  })

  it('does not render MicButton when isSupported is false', () => {
    mockUsePushToTalk.mockImplementation((opts) => {
      capturedOnTranscript = opts.onTranscript
      return { ...defaultHookReturn, isSupported: false }
    })

    render(<ChatInput onSend={vi.fn()} />)
    expect(screen.queryByTitle('Hold to record')).not.toBeInTheDocument()
  })

  it('appends transcript to empty chatInput', () => {
    mockChatInput = ''
    render(<ChatInput onSend={vi.fn()} />)

    expect(capturedOnTranscript).toBeTruthy()
    capturedOnTranscript!('hello world')

    expect(mockSetChatInput).toHaveBeenCalledWith('hello world')
  })

  it('appends transcript with space separator to existing text', () => {
    mockChatInput = 'foo'
    render(<ChatInput onSend={vi.fn()} />)

    capturedOnTranscript!('bar')

    expect(mockSetChatInput).toHaveBeenCalledWith('foo bar')
  })

  it('does not add double space when chatInput ends with space', () => {
    mockChatInput = 'foo '
    render(<ChatInput onSend={vi.fn()} />)

    capturedOnTranscript!('bar')

    expect(mockSetChatInput).toHaveBeenCalledWith('foo bar')
  })

  it('passes disabled to MicButton when ChatInput is disabled', () => {
    render(<ChatInput onSend={vi.fn()} disabled />)
    // The mic button should be disabled
    expect(screen.getByTitle('Hold to record')).toBeDisabled()
  })
})
