'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ManagerOverview from '@/components/manager-overview'
import ManagerApprovals from '@/components/manager-approvals'
import ManagerPeople from '@/components/manager-people'
import ManagerScheduleEditor from '@/components/manager-schedule-editor'
import ManagerCorrections from '@/components/manager-corrections'
import ManagerAudit from '@/components/manager-audit'

const supabase = createClient()

type Profile = {
  id: string
  email: string
  full_name: string | null
  nickname: string | null
  role: 'admin' | 'manager' | 'teammate' | 'dev'
  status: 'pending' | 'active' | 'inactive' | 'terminated'
  timezone: string
  onboarding_complete: boolean
}

type Section = 'Overview' | 'Approvals' | 'People' | 'Schedules' | 'Corrections' | 'Audit'

export default function PortalManager({ currentProfile, onMessage, onError }: { currentProfile: Profile; onMessage: (value: string) => void; onError: (value: string) => void }) {
  const [section, setSection] = useState<Section>('Overview')
  const [pendingCount, setPendingCount] = useState(0)
  const [schedulePeople, setSchedulePeople] = useState<Profile[]>([])

  async function loadShared() {
    const [countResult, peopleResult] = await Promise.all([
      supabase.rpc('manager_pending_counts'),
      supabase.from('profiles').select('id,email,full_name,nickname,role,status,timezone,onboarding_complete').neq('status', 'pending').eq('onboarding_complete', true).order('created_at'),
    ])
    if (countResult.error || peopleResult.error) onError((countResult.error || peopleResult.error)?.message || 'Unable to load Manager tools.')
    const counts = countResult.data as { total?: number } | null
    setPendingCount(counts?.total || 0)
    setSchedulePeople((peopleResult.data || []) as Profile[])
  }

  useEffect(() => { loadShared() }, [])

  function handleApprovalCount(value: number) {
    setPendingCount(value)
  }

  const tabs: Section[] = ['Overview', 'Approvals', 'People', 'Schedules', 'Corrections', 'Audit']

  return <div className="stack manager-portal">
    <div className="manager-tabs">
      {tabs.map((item) => <button type="button" key={item} className={section === item ? 'active' : ''} onClick={() => setSection(item)}>{item}{item === 'Approvals' && pendingCount > 0 ? <span>{pendingCount}</span> : null}</button>)}
    </div>

    {section === 'Overview' && <ManagerOverview pendingCount={pendingCount} onError={onError} />}
    {section === 'Approvals' && <ManagerApprovals onMessage={onMessage} onError={onError} onCountChange={(value) => { handleApprovalCount(value); loadShared() }} />}
    {section === 'People' && <ManagerPeople currentRole={currentProfile.role} onMessage={onMessage} onError={onError} />}
    {section === 'Schedules' && <ManagerScheduleEditor people={schedulePeople} onMessage={onMessage} onError={onError} />}
    {section === 'Corrections' && <ManagerCorrections onMessage={onMessage} onError={onError} />}
    {section === 'Audit' && <ManagerAudit onError={onError} />}
  </div>
}
