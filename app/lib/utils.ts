import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/** Formate un timestamp en heure locale */
export function formatTime(date: string | Date) {
    return new Date(date).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
    })
}

/** Formate une date relative (aujourd'hui, hier, ou la date) */
export function formatRelativeDate(date: string | Date) {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return formatTime(d)
    if (days === 1) return 'Hier'
    if (days < 7) return `${days}j`
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

/** Truncate un texte avec ellipsis */
export function truncate(str: string, maxLen: number) {
    if (!str) return ''
    return str.length > maxLen ? str.slice(0, maxLen) + '…' : str
}

/** Génère des initiales depuis un prénom/nom */
export function getInitials(prenom?: string, nom?: string) {
    const p = prenom?.[0]?.toUpperCase() ?? ''
    const n = nom?.[0]?.toUpperCase() ?? ''
    return (p + n) || '??'
}

/** Couleur de badge selon le score d'engagement */
export function getScoreColor(score: number) {
    if (score >= 80) return 'text-emerald-400'
    if (score >= 50) return 'text-amber-400'
    return 'text-slate-400'
}

/** Couleur de badge selon le statut conversation */
export function getStatutColor(statut: string) {
    const map: Record<string, string> = {
        'Nouveau': 'bg-blue-500/20 text-blue-300',
        'Qualifie': 'bg-purple-500/20 text-purple-300',
        'Proposition faite': 'bg-amber-500/20 text-amber-300',
        'Interesse': 'bg-orange-500/20 text-orange-300',
        'Inscription': 'bg-emerald-500/20 text-emerald-300',
        'Froid': 'bg-slate-500/20 text-slate-400',
    }
    return map[statut] ?? 'bg-slate-500/20 text-slate-400'
}
