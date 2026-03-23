'use client'

import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { usePushToTalk } from '@/hooks/use-push-to-talk'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('MicButton')

interface MicButtonProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

export function MicButton({ onTranscript, disabled }: MicButtonProps) {
  const handleError = useCallback((msg: string) => {
    log.warn('Mic error', { error: msg })
  }, [])

  const { isRecording, isTranscribing, isSupported, startRecording, stopRecording } =
    usePushToTalk({ onTranscript, onError: handleError })

  if (!isSupported) return null

  const title = isTranscribing
    ? 'Transcribing...'
    : isRecording
      ? 'Release to stop'
      : 'Hold to record'

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={`rounded-lg flex-shrink-0 ${isRecording ? 'text-red-400 animate-recording-pulse' : ''}`}
      title={title}
      disabled={disabled || isTranscribing}
      onMouseDown={() => startRecording()}
      onMouseUp={() => stopRecording()}
      onMouseLeave={() => { if (isRecording) stopRecording() }}
      onTouchStart={(e) => { e.preventDefault(); startRecording() }}
      onTouchEnd={(e) => { e.preventDefault(); stopRecording() }}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: 'none' }}
    >
      {isTranscribing ? (
        <span
          className="inline-block w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin"
          data-testid="mic-spinner"
        />
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          data-testid="mic-icon"
        >
          <rect x="5" y="1" width="6" height="9" rx="3" />
          <path d="M3 7v1a5 5 0 0 0 10 0V7" />
          <line x1="8" y1="13" x2="8" y2="15" />
          <line x1="5.5" y1="15" x2="10.5" y2="15" />
        </svg>
      )}
    </Button>
  )
}
