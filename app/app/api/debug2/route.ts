import { NextResponse } from 'next/server'

export async function GET() {
    const key = process.env.WASENDER_WEBHOOK_SECRET || ''
    return NextResponse.json({
        secretPrefix: key.substring(0, 5),
        secretSuffix: key.substring(key.length - 5)
    })
}
