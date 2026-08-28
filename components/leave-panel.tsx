'use client'

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Profile = {
  id: string
  role: 'admin' | 'manager' | 'teammate' | 'dev'
}

type LeaveSummary = {
  balance: number
  hours_equivalent: number
  carryover_balance: number
  carryover_expires_at: string | null
  pending_credits: number
  next_accrual_date: string
  next_accrual_amount: number
  today: string
}

type LeavePreview = {
  scheduled_days: number
  scheduled_dates: string[]
  credits: number
  available_balance: number
  lead_days: number
  auto_threshold_days: number
  auto_eligible: boolean
  requires_manager: boolean
  start_scheduled: boolean
  end_scheduled: boolean
  has_enough_balance: boolean
}

type LeaveHistory = {
  id: string
  leave_type: string
  start_date: string
  end_date: string
  day_type: string
  half_day_period: string | null
  credits_requested: number
  reason: string | null
  status: string
  approval_mode: string | null
  review_note: string | null
  created_at: string
}

type ReviewRow = {
  id: string
  employee_id: string
  employee_name: string
  employee_email: string
  leave_type: string
  start_date: string
  end_date: string
  day_type: string
  half_day_period: string | null
  credits_requested: number
  reason: string | null
  status: string
  approval_mode: string | null
  created_at: string
}

const supabase = createClient()

function preventEnterSubmit(event: ReactKeyboardEvent<HTMLFormElement>) {
  if (event.key === 'Enter') {
    const target = event.target as HTMLElement
    if (target.tagName !== 'TEXTAREA') event.preventDefault()
  }
}

function pretty(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export default function LeavePanel({
  profile,
  onMessage,
  onError,
}: {
  profile: Profile
  onMessage: (value: string) => void
  onError: (value: string) => void
}) {
  const management = profile.role === 'admin' || profile.role === 'manager'
  const [type, setType] = useState<'vacation' | 'sick'>('vacation')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [dayType, setDayType] = useState<'full' | 'half'>('full')
  const [halfDayPeriod, setHalfDayPeriod] = useState<'first_half' | 'second_half'>('first_half')
  const [reason, setReason] = useState('')
  const [summary, setSummary] = useState<LeaveSummary | null>(null)
  const [preview, setPreview] = useState<LeavePreview | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [history, setHistory] = useState<LeaveHistory[]>([])
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [reviewBusyId, setReviewBusyId] = useState('')

  async function load() {
    setLoading(true)
    const summaryPromise = supabase.rpc('get_my_leave_summary')
    const historyPromise = supabase
      .from('leave_requests')
      .select('id,leave_type,start_date,end_date,day_type,half_day_period,credits_requested,reason,status,approval_mode,review_note,created_at')
      .eq('employee_id', profile.id)
      .order('created_at', { ascending: false })

    const reviewPromise = management
      ? supabase.rpc('list_leave_requests_for_review')
      : Promise.resolve({ data: [] as ReviewRow[], error: null })

    const [summaryResult, historyResult, reviewResult] = await Promise.all([
      summaryPromise,
      historyPromise,
      reviewPromise,
    ])

    if (summaryResult.error) onError(summaryResult.error.message)
    else setSummary(summaryResult.data as LeaveSummary)

    if (historyResult.error) onError(historyResult.error.message)
    else setHistory((historyResult.data || []) as LeaveHistory[])

    if (reviewResult.error) onError(reviewResult.error.message)
    else setReviewRows((reviewResult.data || []) as ReviewRow[])

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function runPreview() {
      setPreview(null)
      setPreviewError('')
      if (!start || !end) return
      if (dayType === 'half' && start !== end) return

      setPreviewBusy(true)
      const { data, error } = await supabase.rpc('preview_my_leave_request', {
        p_start_date: start,
        p_end_date: end,
        p_day_type: dayType,
      })

      if (!cancelled) {
        if (error) setPreviewError(error.message)
        else setPreview(data as LeavePreview)
        setPreviewBusy(false)
      }
    }

    const timer = window.setTimeout(runPreview, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [start, end, dayType])

  const canSubmit = useMemo(() => {
    if (!preview || previewBusy || submitBusy) return false
    return preview.start_scheduled && preview.end_scheduled && preview.scheduled_days > 0 && preview.has_enough_balance
  }, [preview, previewBusy, submitBusy])

  function changeDayType(value: 'full' | 'half') {
    setDayType(value)
    if (value === 'half' && start) setEnd(start)
  }

  function changeStart(value: string) {
    setStart(value)
    if (dayType === 'half') setEnd(value)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitBusy(true)
    onError('')
    onMessage('')

    const { data, error } = await supabase.rpc('submit_leave_request', {
      p_leave_type: type,
      p_start_date: start,
      p_end_date: end,
      p_day_type: dayType,
      p_half_day_period: dayType === 'half' ? halfDayPeriod : null,
      p_reason: reason || null,
    })

    if (error) {
      onError(error.message)
    } else {
      const result = data as { status: string; approval_mode: string }
      onMessage(
        result.status === 'approved'
          ? 'Leave approved automatically and credits were deducted.'
          : 'Leave request submitted for Manager approval.',
      )
      setStart('')
      setEnd('')
      setReason('')
      setPreview(null)
      await load()
    }

    setSubmitBusy(false)
  }

  async function review(requestId: string, decision: 'approve' | 'reject') {
    setReviewBusyId(requestId)
    onError('')
    onMessage('')

    const { error } = await supabase.rpc('review_leave_request', {
      p_request_id: requestId,
      p_decision: decision,
      p_review_note: null,
    })

    if (error) onError(error.message)
    else {
      onMessage(decision === 'approve' ? 'Leave request approved.' : 'Leave request rejected.')
      await load()
    }

    setReviewBusyId('')
  }

  if (loading && !summary) {
    return <div className="card">Loading leave balance…</div>
  }

  return (
    <div className="stack leave-panel">
      <div className="leave-summary-grid">
        <div className="card leave-stat-card">
          <div className="leave-stat-label">Available leave</div>
          <div className="leave-stat-value">{summary?.balance ?? 0}</div>
          <div className="muted">credits · {summary?.hours_equivalent ?? 0} hours</div>
        </div>
        <div className="card leave-stat-card">
          <div className="leave-stat-label">Next accrual</div>
          <div className="leave-stat-value">+{summary?.next_accrual_amount ?? 1.5}</div>
          <div className="muted">{formatDate(summary?.next_accrual_date || null)}</div>
        </div>
        <div className="card leave-stat-card">
          <div className="leave-stat-label">Carryover</div>
          <div className="leave-stat-value">{summary?.carryover_balance ?? 0}</div>
          <div className="muted">
            {(summary?.carryover_balance || 0) > 0
              ? `Expires ${formatDate(summary?.carryover_expires_at || null)}`
              : 'Up to 3 credits carry into next year'}
          </div>
        </div>
        <div className="card leave-stat-card">
          <div className="leave-stat-label">Pending requests</div>
          <div className="leave-stat-value">{summary?.pending_credits ?? 0}</div>
          <div className="muted">credits awaiting review</div>
        </div>
      </div>

      <div className="leave-main-grid">
        <div className="card">
          <div className="section-head">
            <div>
              <h2>File leave</h2>
              <p className="muted">Only scheduled working dates are charged leave credits.</p>
            </div>
            <span className="pill">1 credit = 8 hours</span>
          </div>

          <form className="stack" onSubmit={submit} onKeyDown={preventEnterSubmit}>
            <div className="form-grid">
              <label className="field">
                <span>Leave type</span>
                <select value={type} onChange={(event) => setType(event.target.value as 'vacation' | 'sick')}>
                  <option value="vacation">Vacation Leave</option>
                  <option value="sick">Sick Leave</option>
                </select>
              </label>

              <label className="field">
                <span>Day type</span>
                <select value={dayType} onChange={(event) => changeDayType(event.target.value as 'full' | 'half')}>
                  <option value="full">Full day · 1 credit per scheduled day</option>
                  <option value="half">Half day · 0.5 credit</option>
                </select>
              </label>

              <label className="field">
                <span>Start date</span>
                <input type="date" value={start} onChange={(event) => changeStart(event.target.value)} required />
              </label>

              <label className="field">
                <span>End date</span>
                <input
                  type="date"
                  value={end}
                  min={start || undefined}
                  disabled={dayType === 'half'}
                  onChange={(event) => setEnd(event.target.value)}
                  required
                />
              </label>

              {dayType === 'half' && (
                <label className="field">
                  <span>Half-day period</span>
                  <select value={halfDayPeriod} onChange={(event) => setHalfDayPeriod(event.target.value as 'first_half' | 'second_half')}>
                    <option value="first_half">First half · 4 hours</option>
                    <option value="second_half">Second half · 4 hours</option>
                  </select>
                </label>
              )}
            </div>

            <label className="field">
              <span>Reason</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Optional note" />
            </label>

            {(start || end) && (
              <div className={`leave-preview ${preview?.auto_eligible ? 'auto' : ''}`}>
                {previewBusy && <div className="muted">Checking your schedule and leave rules…</div>}
                {previewError && <div className="error">{previewError}</div>}
                {preview && !previewBusy && (
                  <>
                    <div className="leave-preview-top">
                      <div>
                        <strong>{preview.scheduled_days} scheduled day{preview.scheduled_days === 1 ? '' : 's'}</strong>
                        <div className="muted">{preview.credits} credit{preview.credits === 1 ? '' : 's'} will be used</div>
                      </div>
                      <span className={`status-badge ${preview.auto_eligible ? 'approved' : 'pending'}`}>
                        {preview.auto_eligible ? 'Auto-approval eligible' : 'Manager approval'}
                      </span>
                    </div>

                    {!preview.start_scheduled || !preview.end_scheduled ? (
                      <div className="leave-warning">Start and end dates must both be scheduled working days.</div>
                    ) : !preview.has_enough_balance ? (
                      <div className="leave-warning">Not enough credits. Available balance: {preview.available_balance}.</div>
                    ) : (
                      <div className="leave-rule-note">
                        {preview.lead_days >= 5
                          ? `Filed 5+ days ahead: up to ${preview.auto_threshold_days} scheduled leave days can auto-approve.`
                          : `Filed under 5 days ahead: up to ${preview.auto_threshold_days} scheduled leave days can auto-approve.`}
                      </div>
                    )}

                    {preview.scheduled_dates.length > 0 && (
                      <div className="leave-date-chips">
                        {preview.scheduled_dates.map((date) => <span key={date}>{formatDate(date)}</span>)}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {submitBusy ? 'Submitting…' : preview?.auto_eligible ? 'Submit & Auto-Approve' : 'Submit Leave Request'}
            </button>
          </form>
        </div>

        <div className="card leave-rules-card">
          <h2>Leave rules</h2>
          <div className="leave-rule-list">
            <div><strong>Starting balance</strong><span>3 credits from Aug 1, 2026</span></div>
            <div><strong>Monthly accrual</strong><span>+1.5 credits each month</span></div>
            <div><strong>5+ days notice</strong><span>Up to 5 scheduled days auto-approved</span></div>
            <div><strong>Under 5 days notice</strong><span>Up to 2 scheduled days auto-approved</span></div>
            <div><strong>Carryover</strong><span>Maximum 3 credits</span></div>
            <div><strong>Carryover expiry</strong><span>End of February</span></div>
          </div>
          <p className="muted leave-rule-footnote">Expiring carryover credits are consumed before newer credits.</p>
        </div>
      </div>

      {management && (
        <div className="card">
          <div className="section-head">
            <div>
              <h2>Team leave approvals</h2>
              <p className="muted">Requests outside the auto-approval limits appear here.</p>
            </div>
            <span className="pill">{reviewRows.length} pending</span>
          </div>

          <div className="list" style={{ marginTop: 16 }}>
            {reviewRows.length === 0 && <div className="empty-state">No leave requests need review.</div>}
            {reviewRows.map((row) => (
              <div className="row leave-review-row" key={row.id}>
                <div>
                  <strong>{row.employee_name}</strong>
                  <div className="muted">{row.employee_email}</div>
                  <div className="leave-review-detail">
                    {pretty(row.leave_type)} · {formatDate(row.start_date)} to {formatDate(row.end_date)} · {row.credits_requested} credit(s)
                  </div>
                  {row.reason && <div className="muted">“{row.reason}”</div>}
                </div>
                <div className="actions">
                  <button className="btn btn-secondary" disabled={reviewBusyId === row.id} onClick={() => review(row.id, 'reject')}>Reject</button>
                  <button className="btn btn-primary" disabled={reviewBusyId === row.id} onClick={() => review(row.id, 'approve')}>
                    {reviewBusyId === row.id ? 'Saving…' : 'Approve'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-head">
          <div>
            <h2>Leave history</h2>
            <p className="muted">Your submitted and approved requests.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={load}>Refresh</button>
        </div>

        <div className="list" style={{ marginTop: 16 }}>
          {history.length === 0 && <div className="empty-state">No leave requests yet.</div>}
          {history.map((row) => (
            <div className="row leave-history-row" key={row.id}>
              <div>
                <strong>{pretty(row.leave_type)}</strong>
                <div className="muted">
                  {formatDate(row.start_date)} to {formatDate(row.end_date)} · {row.credits_requested} credit(s)
                </div>
                <div className="leave-history-meta">
                  {row.day_type === 'half' ? `${pretty(row.half_day_period || '')} · ` : ''}
                  {row.approval_mode === 'auto' ? 'Automatic approval' : 'Manager review'}
                </div>
              </div>
              <span className={`status-badge ${row.status}`}>{pretty(row.status)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
