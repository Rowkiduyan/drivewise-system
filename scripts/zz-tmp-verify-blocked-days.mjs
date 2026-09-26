// Disposable check for crew_capacity_blocked_days() (2026-09-26).
// Signs in as a real Customer, calls the RPC, and independently recomputes
// the same answer in JS from service_role reads, then diffs the two.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx), l.slice(idx + 1).trim()]
    }),
)
const SUPABASE_URL = env.VITE_SUPABASE_URL
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const CUSTOMER_EMAIL = process.argv[2] || 'jmsoho01@marveltrucking.local'
const HORIZON = 60

const admin = createClient(SUPABASE_URL, SERVICE_KEY)
const anon = createClient(SUPABASE_URL, ANON_KEY)

const ACTIVE = ['ASSIGNED', 'OUT_FOR_PICKUP', 'ARRIVED_PICKUP', 'OUT_FOR_DROPOFF', 'ARRIVED_DROPOFF']

function manilaTodayISO() {
  // Manila is UTC+8 with no DST.
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  return now.toISOString().slice(0, 10)
}

function dateKeys(startISO, days) {
  const out = []
  const [y, m, d] = startISO.split('-').map(Number)
  const cursor = new Date(Date.UTC(y, m - 1, d))
  for (let i = 0; i <= days; i++) {
    out.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

function dowOf(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

async function expectedBlocked(customerAuthId) {
  const [{ data: users }, { data: avail }, { data: specialties }, { data: trips }, { data: dRec }, { data: hRec }] =
    await Promise.all([
      admin.from('users').select('id, role, deactivated_at').in('role', ['Driver', 'Helper']),
      admin.from('crew_availability').select('crew_auth_id, day_of_week'),
      admin.from('crew_client_specialties').select('crew_auth_id').eq('client_auth_id', customerAuthId),
      admin
        .from('delivery_requests')
        .select('pickup_date, dropoff_date, status, assigned_driver_id, assigned_helper_ids')
        .in('status', ACTIVE),
      admin.from('driver_records').select('id, auth_id'),
      admin.from('helper_records').select('id, auth_id'),
    ])

  const unrestricted = (specialties || []).length === 0
  const specializedSet = new Set((specialties || []).map((s) => s.crew_auth_id))
  const workingByAuth = new Map()
  for (const a of avail || []) {
    if (!workingByAuth.has(a.crew_auth_id)) workingByAuth.set(a.crew_auth_id, new Set())
    workingByAuth.get(a.crew_auth_id).add(a.day_of_week)
  }

  const roster = (users || [])
    .filter((u) => !u.deactivated_at)
    .filter((u) => unrestricted || specializedSet.has(u.id))
    .map((u) => ({ id: u.id, role: u.role, days: workingByAuth.get(u.id) || new Set() }))
    .filter((r) => r.days.size > 0)

  const driverAuthByRecord = new Map((dRec || []).map((r) => [r.id, r.auth_id]))
  const helperAuthByRecord = new Map((hRec || []).map((r) => [r.id, r.auth_id]))

  const busyRanges = []
  for (const t of trips || []) {
    const start = t.pickup_date?.slice(0, 10)
    const end = (t.dropoff_date || t.pickup_date)?.slice(0, 10)
    if (!start) continue
    if (t.assigned_driver_id) {
      const authId = driverAuthByRecord.get(t.assigned_driver_id)
      if (authId) busyRanges.push({ authId, role: 'Driver', start, end })
    }
    for (const rec of t.assigned_helper_ids || []) {
      const authId = helperAuthByRecord.get(rec)
      if (authId) busyRanges.push({ authId, role: 'Helper', start, end })
    }
  }

  const today = manilaTodayISO()
  const blocked = []
  for (const day of dateKeys(today, HORIZON)) {
    const dow = dowOf(day)
    const working = { Driver: 0, Helper: 0 }
    const busy = { Driver: new Set(), Helper: new Set() }
    const rosterByAuth = new Map(roster.map((r) => [r.id, r]))
    for (const r of roster) {
      if (!r.days.has(dow)) continue
      working[r.role] += 1
    }
    for (const b of busyRanges) {
      // Mirror the SQL: only a roster member who also works this weekday
      // can be "used up" by a trip on it.
      const member = rosterByAuth.get(b.authId)
      if (!member || member.role !== b.role || !member.days.has(dow)) continue
      if (!(b.start <= day && day <= b.end)) continue
      busy[b.role].add(b.authId)
    }
    const freeD = working.Driver - busy.Driver.size
    const freeH = working.Helper - busy.Helper.size
    if (freeD < 1 || freeH < 1) blocked.push(day)
  }
  return { blocked, rosterSize: roster.length, tripCount: (trips || []).length, unrestricted }
}

async function main() {
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: CUSTOMER_EMAIL })
  if (!linkData) throw new Error('generateLink failed')
  const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  })
  if (verifyErr) throw new Error(verifyErr.message)
  const customer = verifyData.session.user

  const { data: rpcData, error: rpcErr } = await anon.rpc('crew_capacity_blocked_days', { p_horizon_days: HORIZON })
  if (rpcErr) {
    console.log('RPC ERROR:', rpcErr.message)
    process.exit(1)
  }

  const { blocked: expected, rosterSize, tripCount, unrestricted } = await expectedBlocked(customer.id)

  const got = [...(rpcData || [])].sort()
  const want = [...expected].sort()
  const same = got.length === want.length && got.every((d, i) => d === want[i])

  console.log('customer:', CUSTOMER_EMAIL, '| roster:', rosterSize, '| active trips:', tripCount, '| unrestricted:', unrestricted)
  console.log('RPC blocked count:', got.length, '| independent count:', want.length, '| match:', same)
  if (!same) {
    console.log('only in RPC:   ', got.filter((d) => !want.includes(d)))
    console.log('only in JS:    ', want.filter((d) => !got.includes(d)))
  }
  console.log('RPC dates (first 20):', got.slice(0, 20).join(', '))
  const today = manilaTodayISO()
  const recent = dateKeys(today, 14)
  console.log('next 14 days ->', recent.map((d) => `${d}${got.includes(d) ? ' BLOCKED' : ' ok'}`).join('\n                '))
  process.exit(same ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
