#!/usr/bin/env node
// Reverses scripts/seed-dr0053-return-trip.mjs: closes/removes the demo
// return-trip Session it created on DR-0053, so the delivery goes back to
// exactly its pre-demo state (DELIVERED, no open Session).
// Usage: set -a; source .env; set +a; node scripts/cleanup-dr0053-return-trip.mjs
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const DELIVERY_ID = 'DR-0053'

async function main() {
  const { data: session, error: fetchErr } = await admin
    .from('sessions')
    .select('session_id, is_return_trip, status')
    .eq('delivery_request_id', DELIVERY_ID)
    .eq('status', 'Active')
    .eq('is_return_trip', true)
    .maybeSingle()
  if (fetchErr) throw new Error(fetchErr.message)
  if (!session) {
    console.log('No Active return-trip session found on DR-0053 -- nothing to clean up (already closed/deleted).')
    return
  }

  const { error: deleteErr } = await admin
    .from('sessions')
    .delete()
    .eq('session_id', session.session_id)
  if (deleteErr) throw new Error(deleteErr.message)

  console.log('Deleted demo return-trip session:', session.session_id)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
