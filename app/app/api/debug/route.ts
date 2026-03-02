import { NextResponse } from 'next/server'

export async function GET() {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY || ''
    return NextResponse.json({
        keyPrefix: key.substring(0, 10),
        keySuffix: key.substring(key.length - 5)
    })
}
