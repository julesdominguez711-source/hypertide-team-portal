import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Hypertide Team Portal',
  description: 'Internal scheduling, attendance, leave, and approvals portal',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
