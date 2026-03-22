// hooks/useSound.ts
// Hook léger pour le Sound Design de l'interface CRM

'use client'

import { useCallback, useRef } from 'react'

type SoundType = 'click' | 'success' | 'error' | 'notification' | 'save'

// Génère des sons via l'API Web Audio (pas besoin de fichiers externes)
function createSound(ctx: AudioContext, type: SoundType) {
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    const now = ctx.currentTime

    switch (type) {
        case 'click':
            oscillator.type = 'sine'
            oscillator.frequency.setValueAtTime(800, now)
            oscillator.frequency.exponentialRampToValueAtTime(400, now + 0.05)
            gainNode.gain.setValueAtTime(0.15, now)
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
            oscillator.start(now)
            oscillator.stop(now + 0.08)
            break

        case 'success':
            oscillator.type = 'sine'
            oscillator.frequency.setValueAtTime(523, now)      // Do
            oscillator.frequency.setValueAtTime(659, now + 0.1) // Mi
            oscillator.frequency.setValueAtTime(784, now + 0.2) // Sol
            gainNode.gain.setValueAtTime(0.2, now)
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
            oscillator.start(now)
            oscillator.stop(now + 0.4)
            break

        case 'error':
            oscillator.type = 'sawtooth'
            oscillator.frequency.setValueAtTime(300, now)
            oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.2)
            gainNode.gain.setValueAtTime(0.15, now)
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
            oscillator.start(now)
            oscillator.stop(now + 0.25)
            break

        case 'notification':
            oscillator.type = 'sine'
            oscillator.frequency.setValueAtTime(880, now)
            oscillator.frequency.setValueAtTime(1100, now + 0.1)
            gainNode.gain.setValueAtTime(0.12, now)
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
            oscillator.start(now)
            oscillator.stop(now + 0.3)
            break

        case 'save':
            oscillator.type = 'sine'
            oscillator.frequency.setValueAtTime(440, now)      // La
            oscillator.frequency.setValueAtTime(554, now + 0.1) // Do#
            gainNode.gain.setValueAtTime(0.18, now)
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
            oscillator.start(now)
            oscillator.stop(now + 0.3)
            break
    }
}

export function useSound(enabled = true) {
    const audioCtxRef = useRef<AudioContext | null>(null)

    const play = useCallback((type: SoundType) => {
        if (!enabled) return
        try {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
            }
            const ctx = audioCtxRef.current
            if (ctx.state === 'suspended') ctx.resume()
            createSound(ctx, type)
        } catch {
            // Silently fail if Web Audio API not available
        }
    }, [enabled])

    return { play }
}
