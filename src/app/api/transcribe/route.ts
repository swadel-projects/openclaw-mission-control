import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB — Whisper API limit

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    logger.error('OPENAI_API_KEY not configured')
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
  }

  try {
    const formData = await request.formData()
    const audio = formData.get('audio')

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    if (audio.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Audio file too large' }, { status: 413 })
    }

    const whisperForm = new FormData()
    whisperForm.append('file', audio, 'audio.webm')
    whisperForm.append('model', 'gpt-4o-mini-transcribe')
    whisperForm.append('language', 'en')
    whisperForm.append('response_format', 'json')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      logger.error({ status: response.status, error: errorText }, 'Whisper API error')
      return NextResponse.json({ error: 'Transcription failed' }, { status: 502 })
    }

    const result = await response.json()
    return NextResponse.json({ text: result.text })
  } catch (error) {
    logger.error({ err: error }, 'Transcribe route error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
