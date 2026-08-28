'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ManagerApprovals from '@/components/manager-approvals'
import ManagerPeople from '@/components/manager-people'
import ManagerScheduleEditor from '@/components/manager-schedule-editor'
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

type Section = 'Approvals' | 'People' | 'Schedules' | 'Audit'

export default function PortalManager({ currentProfile, onMessage, onError }: { currentProfile: Profile; onMessage: (value: string) => void; onError: (value: string) => void }) {
  const [section, setSection] = useState<Section>('Approvals')
  const [pendingCount, setPendingCount] = useState(0)
  const [schedulePeople, setSchedulePeople] = useState<Profile[]>([])

  async function loadPeople() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,full_name,nickname,role,status,timezone,onboarding_complete')
      .neq('status', 'pending')
      .eq('onboarding_complete', true)
      .order('created_at')

    if (error) onError(error.message)
    else setSchedulePeople((data || []) as Profile[])
  }

  useEffect(() => { loadPeople() }, [])

  const tabs: Section[] = ['Approvals', 'People', 'Schedules', 'Audit']
  const managementRole: 'admin' | 'manager' = currentProfile.role === 'admin' ? 'admin' : 'manager'

  return <div className="stack manager-portal">
    <div className="manager-tabs">
      {tabs.map((item) => <button type="button" key={item} className={section === item ? 'active' : ''} onClick={() => setSection(item)}>{item}{item === 'Approvals' && pendingCount > 0 ? <span>{pendingCount}</span> : null}</button>)}
    </div>

    {section === 'Approvals' && <ManagerApprovals onMessage={onMessage} onError={onError} onCountChange={setPendingCount} />}
    {section === 'People' && <ManagerPeople currentRole={managementRole} onMessage={onMessage} onError={onError} />}
    {section === 'Schedules' && <ManagerScheduleEditor people={schedulePeople} onMessage={onMessage} onError={onError} />}
    {section === 'Audit' && <ManagerAudit onError={onError} />}
  </div>
}
