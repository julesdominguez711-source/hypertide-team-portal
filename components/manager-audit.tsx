'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

type AuditRow = {
  id: number
  actor_id: string | null
  actor_name: string
  action: string
  entity_type: string
  entity_id: string | null
  old_value: unknown
  new_value: unknown
  reason: string | null
  created_at: string
}

function pretty(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }

export default function ManagerAudit({ onError }: { onError: (value: string) => void }) {
  const [rows, setRows] = useState<AuditRow[]>([])

  async function load() {
    const { data, error } = await supabase.rpc('list_audit_logs', { p_limit: 100 })
    if (error) onError(error.message)
    else setRows((data || []) as AuditRow[])
  }

  useEffect(() => { load() }, [])

  return <div className="card">
    <div className="section-head"><div><h2>Audit log</h2><p className="muted">Actor, action, old/new values, reason, and timestamp.</p></div><button className="btn btn-secondary" onClick={load}>Refresh</button></div>
    <div className="audit-list" style={{ marginTop: 16 }}>
      {rows.length === 0 && <div className="empty-state">No audit events yet.</div>}
      {rows.map((row) => <details className="audit-row" key={row.id}><summary><div><strong>{pretty(row.action)}</strong><span>{row.actor_name} · {row.entity_type}</span></div><div><span>{new Date(row.created_at).toLocaleString()}</span>{row.reason && <small>{row.reason}</small>}</div></summary><div className="audit-values"><div><strong>Old value</strong><pre>{JSON.stringify(row.old_value, null, 2)}</pre></div><div><strong>New value</strong><pre>{JSON.stringify(row.new_value, null, 2)}</pre></div></div></details>)}
    </div>
  </div>
}
