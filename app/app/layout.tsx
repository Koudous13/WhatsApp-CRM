import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

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
      <body className={`${inter.className} bg-[#0a0f1e] text-white min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
