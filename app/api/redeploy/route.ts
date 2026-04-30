import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COOLIFY_API_URL = process.env.COOLIFY_API_URL
const COOLIFY_API_TOKEN = process.env.COOLIFY_API_TOKEN
const COOLIFY_LA_CABANE_APP_UUID = process.env.COOLIFY_LA_CABANE_APP_UUID

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-upload-secret')
  if (!secret || secret !== process.env.UPLOAD_SECRET_KEY) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  if (!COOLIFY_API_URL || !COOLIFY_API_TOKEN || !COOLIFY_LA_CABANE_APP_UUID) {
    return NextResponse.json({ error: 'Coolify non configuré' }, { status: 500 })
  }

  try {
    const response = await fetch(
      `${COOLIFY_API_URL}/api/v1/applications/${COOLIFY_LA_CABANE_APP_UUID}/deploy`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${COOLIFY_API_TOKEN}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      }
    )

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return NextResponse.json(
        { error: data.message ?? `Erreur Coolify ${response.status}` },
        { status: response.status }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
