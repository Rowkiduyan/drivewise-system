#!/usr/bin/env node
// Marks DR-0078 as COMPLETED, closing any still-open session first so
// nothing is left dangling (same "test-only shortcut" pattern other
// disposable-fixture scripts in this repo already use to fast-track a
// delivery to COMPLETED, bypassing the real Customer-confirm/Supervisor-
// issue-resolution flow — see STATUS.md).
// Usage: set -a; source .env; set +a; node scripts/complete-dr0078.mjs
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function main() {
  const { data: before, error: readErr } = await admin
    .from('delivery_requests')
    .select('id, status, assigned_driver_id, assigned_truck_plate')
    .eq('id', 'DR-0078')
    .maybeSingle()
  if (readErr) throw new Error(readErr.message)
  if (!before) throw new Error('DR-0078 not found')
  console.log('BEFORE:', before)

  const { data: openSession, error: sessErr } = await admin
    .from('sessions')
    .select('session_id, status')
    .eq('delivery_request_id', 'DR-0078')
    .eq('status', 'Active')
    .maybeSingle()
  if (sessErr) console.log('session lookup error (non-fatal):', sessErr.message)

  if (openSession) {
    console.log('Closing open session:', openSession.session_id)
    const { error: closeErr } = await admin
      .from('sessions')
      .update({ status: 'Completed', end_time: new Date().toISOString() })
      .eq('session_id', openSession.session_id)
    if (closeErr) console.log('session close error (non-fatal):', closeErr.message)
  }

  const { data: after, error: writeErr } = await admin
    .from('delivery_requests')
    .update({ status: 'COMPLETED' })
    .eq('id', 'DR-0078')
    .select()
    .maybeSingle()
  if (writeErr) throw new Error(writeErr.message)
  console.log('AFTER:', after)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
