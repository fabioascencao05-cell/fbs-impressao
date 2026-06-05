import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FBS Vetor — Pré-Impressão Automática',
  description: 'Silk Screen e DTF com IA. Resultado em minutos.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
