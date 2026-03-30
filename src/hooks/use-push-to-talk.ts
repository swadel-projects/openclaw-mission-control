'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('PushToTalk')

export interface UsePushToTalkOptions {
  onTranscript: (text: string) => void
  onError?: (error: string) => void
}

export interface UsePushToTalkReturn {
  isRecording: boolean
  isTranscribing: boolean
  isSupported: boolean
  toggleRecording: () => void
}

function getSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return types.find((t) => MediaRecorder.isTypeSupported(t))
}

export function usePushToTalk(options: UsePushToTalkOptions): UsePushToTalkReturn {
  const { onTranscript, onError } = options

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSupported, setIsSupported] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    const supported =
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    setIsSupported(supported)
    return () => { isMountedRef.current = false }
  }, [])

  const transcribe = useCallback(
    async (blob: Blob) => {
      if (!isMountedRef.current) return
      setIsTranscribing(true)
      try {
        const formData = new FormData()
        formData.append('audio', blob, 'audio.webm')
        const response = await fetch('/api/transcribe', { method: 'POST', body: formData })
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

  const stopAndTranscribe = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    mediaRecorderRef.current = null
    if (isMountedRef.current) setIsRecording(false)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop())
        return
      }

      streamRef.current = stream
      chunksRef.current = []

      let recorder: MediaRecorder
      try {
        const mimeType = getSupportedMimeType()
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream)
      } catch (recErr) {
        stream.getTracks().forEach(t => t.stop())
        onError?.('Failed to create MediaRecorder')
        if (isMountedRef.current) setIsRecording(false)
        return
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const chunks = [...chunksRef.current]
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop())
          streamRef.current = null
        }
        if (chunks.length === 0) return
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        transcribe(blob)
      }

      mediaRecorderRef.current = recorder
      recorder.start(250)

      if (isMountedRef.current) setIsRecording(true)
    } catch (err) {
      if (!isMountedRef.current) return
      setIsRecording(false)
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setIsSupported(false)
        onError?.('Microphone permission denied')
      } else {
        onError?.(err instanceof Error ? err.message : 'Failed to access microphone')
      }
    }
  }, [onError, transcribe])

  const toggleRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      stopAndTranscribe()
    } else {
      startRecording()
    }
  }, [startRecording, stopAndTranscribe])

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop() } catch (_) { /* */ }
      }
      mediaRecorderRef.current = null
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [])

  return { isRecording, isTranscribing, isSupported, toggleRecording }
}
