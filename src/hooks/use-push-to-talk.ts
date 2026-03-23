'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('PushToTalk')

export interface UsePushToTalkOptions {
  onTranscript: (text: string) => void
  onError?: (error: string) => void
  minDurationMs?: number
}

export interface UsePushToTalkReturn {
  isRecording: boolean
  isTranscribing: boolean
  isSupported: boolean
  startRecording: () => void
  stopRecording: () => void
}

function getSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ]
  return types.find((t) => MediaRecorder.isTypeSupported(t))
}

export function usePushToTalk(options: UsePushToTalkOptions): UsePushToTalkReturn {
  const { onTranscript, onError, minDurationMs = 500 } = options

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSupported, setIsSupported] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const recordingRef = useRef(false)
  const isMountedRef = useRef(true)

  // Check browser support on mount
  useEffect(() => {
    const supported =
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    setIsSupported(supported)

    return () => {
      isMountedRef.current = false
    }
  }, [])

  const stopStreamTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const transcribe = useCallback(
    async (blob: Blob) => {
      if (!isMountedRef.current) return
      setIsTranscribing(true)

      try {
        const formData = new FormData()
        formData.append('audio', blob, 'audio.webm')

        const response = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData,
        })

        const data = await response.json()

        if (!isMountedRef.current) return

        if (response.ok && data.text) {
          onTranscript(data.text)
        } else {
          const msg = data.error || 'Transcription failed'
          log.warn('Transcription error', { error: msg })
          onError?.(msg)
        }
      } catch (err) {
        if (!isMountedRef.current) return
        const msg = err instanceof Error ? err.message : 'Transcription failed'
        log.error('Transcription fetch error', { error: msg })
        onError?.(msg)
      } finally {
        if (isMountedRef.current) setIsTranscribing(false)
      }
    },
    [onTranscript, onError],
  )

  const startRecording = useCallback(async () => {
    if (recordingRef.current) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      streamRef.current = stream
      chunksRef.current = []
      startTimeRef.current = Date.now()
      recordingRef.current = true

      const mimeType = getSupportedMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const duration = Date.now() - startTimeRef.current
        const chunks = [...chunksRef.current]
        stopStreamTracks()

        if (duration < minDurationMs) {
          log.debug('Recording too short, discarding', { duration })
          return
        }

        if (chunks.length === 0) {
          log.debug('No audio chunks captured')
          return
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        transcribe(blob)
      }

      mediaRecorderRef.current = recorder
      recorder.start()

      if (isMountedRef.current) setIsRecording(true)
    } catch (err) {
      recordingRef.current = false
      if (!isMountedRef.current) return

      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setIsSupported(false)
        onError?.('Microphone permission denied')
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to start recording'
        log.error('getUserMedia error', { error: msg })
        onError?.(msg)
      }
    }
  }, [minDurationMs, onError, stopStreamTracks, transcribe])

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return
    recordingRef.current = false

    if (isMountedRef.current) setIsRecording(false)

    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    mediaRecorderRef.current = null
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current = false
        const recorder = mediaRecorderRef.current
        if (recorder && recorder.state !== 'inactive') {
          recorder.stop()
        }
        mediaRecorderRef.current = null
      }
      stopStreamTracks()
    }
  }, [stopStreamTracks])

  return { isRecording, isTranscribing, isSupported, startRecording, stopRecording }
}
