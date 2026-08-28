'use client'

import PortalLiveStatus from '@/components/portal-live-status'

type Profile = {
  id: string
  timezone: string
  role: 'admin' | 'manager' | 'teammate' | 'dev'
}

function prettyRole(role: string) {
  return role === 'dev' ? 'Dev' : role.charAt(0).toUpperCase() + role.slice(1)
}

export default function PortalDashboard({ profile }: { profile: Profile }) {
  return (
    <div className="stack">
      <PortalLiveStatus employeeId={profile.id} />
      <div className="grid">
        <div className="card interactive-card"><div className="muted">Status</div><div className="metric">Active</div></div>
        <div className="card interactive-card"><div className="muted">Timezone</div><div className="metric" style={{ fontSize: 22 }}>{profile.timezone}</div></div>
        <div className="card interactive-card"><div className="muted">Position</div><div className="metric">{prettyRole(profile.role)}</div></div>
      </div>
    </div>
  )
}
