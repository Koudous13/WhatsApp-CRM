import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BloLab CRM — Agent WhatsApp IA',
  description: 'Dashboard de gestion des conversations WhatsApp avec IA — BloLab Bénin',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className="dark">
      <body className="text-white min-h-screen theme-gradient">
        {children}
      </body>
    </html>
  )
}
