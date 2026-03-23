import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MicButton } from '../mic-button'

// Mock the hook with controllable return values
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
  usePushToTalk: vi.fn(() => defaultHookReturn),
}))

vi.mock('@/lib/client-logger', () => ({
  createClientLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { usePushToTalk } from '@/hooks/use-push-to-talk'
const mockUsePushToTalk = vi.mocked(usePushToTalk)

describe('MicButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePushToTalk.mockReturnValue(defaultHookReturn)
  })

  it('renders nothing when isSupported is false', () => {
    mockUsePushToTalk.mockReturnValue({ ...defaultHookReturn, isSupported: false })

    const { container } = render(<MicButton onTranscript={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders a button when isSupported is true', () => {
    render(<MicButton onTranscript={vi.fn()} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows mic SVG icon in idle state', () => {
    render(<MicButton onTranscript={vi.fn()} />)
    expect(screen.getByTestId('mic-icon')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Hold to record')
  })

  it('shows spinner when isTranscribing is true', () => {
    mockUsePushToTalk.mockReturnValue({ ...defaultHookReturn, isTranscribing: true })

    render(<MicButton onTranscript={vi.fn()} />)
    expect(screen.getByTestId('mic-spinner')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Transcribing...')
  })

  it('calls startRecording on mouseDown', () => {
    render(<MicButton onTranscript={vi.fn()} />)
    fireEvent.mouseDown(screen.getByRole('button'))
    expect(mockStartRecording).toHaveBeenCalledTimes(1)
  })

  it('calls stopRecording on mouseUp', () => {
    render(<MicButton onTranscript={vi.fn()} />)
    fireEvent.mouseUp(screen.getByRole('button'))
    expect(mockStopRecording).toHaveBeenCalledTimes(1)
  })

  it('calls stopRecording on mouseLeave when recording', () => {
    mockUsePushToTalk.mockReturnValue({ ...defaultHookReturn, isRecording: true })

    render(<MicButton onTranscript={vi.fn()} />)
    fireEvent.mouseLeave(screen.getByRole('button'))
    expect(mockStopRecording).toHaveBeenCalledTimes(1)
  })

  it('does NOT call stopRecording on mouseLeave when not recording', () => {
    render(<MicButton onTranscript={vi.fn()} />)
    fireEvent.mouseLeave(screen.getByRole('button'))
    expect(mockStopRecording).not.toHaveBeenCalled()
  })

  it('button is disabled when disabled prop is true', () => {
    render(<MicButton onTranscript={vi.fn()} disabled />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('button is disabled when isTranscribing is true', () => {
    mockUsePushToTalk.mockReturnValue({ ...defaultHookReturn, isTranscribing: true })

    render(<MicButton onTranscript={vi.fn()} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
