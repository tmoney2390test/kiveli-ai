import { adminClient, serverEnv } from '../_shared/context.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { waitUntil } from '../_shared/background.ts';
import { constantTimeEqual } from '../../../packages/together-domain/src/security.ts';
import { accountDeletionStarted } from '../_shared/kivelle-deleted-account.ts';
import { transactionalEmail, retryableEmailStatus, type EmailKind } from '../_shared/transactional-email.ts';

async function dispatch() {
  const db = adminClient();
  const key = Deno.env.get('RESEND_API_KEY') || (await db.rpc('kivelle_email_sender_key')).data;
  const from = Deno.env.get('KIVELLE_SUPPORT_EMAIL_FROM') || 'Kivelli Support <notifications@kivelli.app>';
  if (typeof key !== 'string' || !key) return;
  for (let i = 0; i < 10; i++) {
    const claim = await db.rpc('kivelle_claim_transactional_email');
    if (claim.error) throw new Error('Email queue could not be claimed');
    const row = claim.data?.[0];
    if (!row) break;
    let result: { status: string; error_code: string | null; provider_id?: string; sent_at?: string };
    try {
      const { data, error } = await db.auth.admin.getUserById(row.user_id);
      if (error) throw new Error('Account lookup unavailable');
      if (!data.user?.email || !data.user.email_confirmed_at || await accountDeletionStarted(db, row.user_id)) {
        result = { status: 'skipped', error_code: 'recipient_unavailable' };
      } else {
        const to = ['support_new','support_followup'].includes(row.kind) ? Deno.env.get('KIVELLE_SUPPORT_EMAIL') || 'support@kivelli.app' : data.user.email;
        const message = transactionalEmail(row.kind as EmailKind, row.payload);
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'Idempotency-Key': `kivelli-email-${row.id}` },
          body: JSON.stringify({ from, to: [to], ...message, reply_to: 'support@kivelli.app', tags: [{ name: 'kind', value: row.kind }] }),
          signal: AbortSignal.timeout(8000),
        });
        if (response.ok) {
          const body = await response.json();
          result = { status: 'sent', error_code: null, provider_id: body.id, sent_at: new Date().toISOString() };
        } else {
          result = { status: retryableEmailStatus(response.status) ? 'pending' : 'failed', error_code: `http_${response.status}` };
        }
      }
    } catch {
      result = { status: 'pending', error_code: 'request_failed' };
    }
    const saved = await db.from('together_email_outbox').update(result).eq('id', row.id).eq('attempts', row.attempts);
    if (saved.error) throw new Error('Email delivery status could not be saved');
    if (row.kind === 'support_new' && row.payload.ticketId) {
      // Merge existing ticket metadata so unrelated diagnostics remain intact.
      const ticket = await db.from('together_support_tickets').select('metadata').eq('id',row.payload.ticketId).maybeSingle();
      if (ticket.data) await db.from('together_support_tickets').update({metadata:{...ticket.data.metadata,support_email_status:result.status === 'pending' ? 'queued' : result.status,support_email_provider_id:result.provider_id ?? null,support_email_error_code:result.error_code,support_email_attempted_at:new Date().toISOString()}}).eq('id',row.payload.ticketId);
    }
  }
}

serve(async (request, correlationId) => {
  if (request.method !== 'POST') throw new AppError('NOT_FOUND', 'Unavailable.', 404);
  if (!constantTimeEqual(request.headers.get('x-together-dispatch-secret') ?? '', serverEnv('TOGETHER_MEDIA_DISPATCH_SECRET'))) throw new AppError('FORBIDDEN', 'Authorization required.', 403);
  waitUntil(dispatch());
  return json({ data: { queued: true }, correlationId }, 202, correlationId);
});
