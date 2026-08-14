import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { adminClient, enforceRateLimit, serverEnv } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';

const schema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72),
});

serve(async (request, correlationId) => {
  if (request.method !== 'POST') throw new AppError('VALIDATION_FAILED', 'Use POST to create an account.', 405);
  const input = await parseBody(request, schema);
  const db = adminClient();
  const forwarded = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  await enforceRateLimit(db, await fingerprint(`ip:${forwarded}`), 'together_public_signup', 20, 3600);
  await enforceRateLimit(db, await fingerprint(`email:${input.email}`), 'together_public_signup_email', 5, 3600);

  // A successful password grant proves this is an existing confirmed account.
  const publicAuth = createClient(serverEnv('SUPABASE_URL'), serverEnv('SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const existingSession = await publicAuth.auth.signInWithPassword(input);
  if (existingSession.data.session) return json({ data: { ready: true, existing: true }, correlationId }, 200, correlationId);

  // GoTrue validates the password before returning email_not_confirmed. This lets
  // Together repair accounts created by its previous confirmation-based flow
  // without weakening Jukestr's project-wide signup policy.
  if (existingSession.error?.code === 'email_not_confirmed') {
    const user = await findUserByEmail(input.email);
    if (!user) throw new AppError('CONFLICT', 'This account could not be prepared for Together.', 409);
    const { error } = await db.auth.admin.updateUserById(user.id, { email_confirm: true, user_metadata: { ...user.user_metadata, signup_app: 'together' } });
    if (error) throw new AppError('INTERNAL_ERROR', 'This account could not be prepared for Together.', 500, true);
    return json({ data: { ready: true, existing: true }, correlationId }, 200, correlationId);
  }

  const { error } = await db.auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true, user_metadata: { signup_app: 'together' } });
  if (error) {
    const duplicate = /already|registered|exists/i.test(error.message);
    throw new AppError(duplicate ? 'CONFLICT' : 'INTERNAL_ERROR', duplicate ? 'An account with this email already exists. Sign in instead.' : 'Your Together account could not be created.', duplicate ? 409 : 500, !duplicate);
  }
  return json({ data: { ready: true, existing: false }, correlationId }, 201, correlationId);
});

async function findUserByEmail(email: string) {
  const db = adminClient();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new AppError('INTERNAL_ERROR', 'This account could not be prepared for Together.', 500, true);
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function fingerprint(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
