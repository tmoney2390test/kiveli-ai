import { z } from 'zod';
import { adminClient, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { isAtLeast18 } from '../../../packages/together-domain/src/adult-access.ts';

const schema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

serve(async (request, correlationId) => {
  if (request.method !== 'POST') throw new AppError('VALIDATION_FAILED', 'Use POST to create an account.', 405);
  const input = await parseBody(request, schema);
  if(!isAtLeast18(input.dateOfBirth,new Date()))throw new AppError('FORBIDDEN','You must be 18 or older to create a Kivelle account.',403,false);
  const db = adminClient();
  const forwarded = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  await enforceRateLimit(db, await fingerprint(`ip:${forwarded}`), 'together_public_signup', 20, 3600);
  await enforceRateLimit(db, await fingerprint(`email:${input.email}`), 'together_public_signup_email', 5, 3600);

  // This Supabase project has a global auto-confirm policy for another app.
  // Kivelle creates password users explicitly unconfirmed; the client then
  // requests a PKCE email magic link with shouldCreateUser=false so the verifier
  // remains on that device and clicking the link proves ownership.
  // Never repair, confirm, or replace a password for an existing email here.
  const { data:created, error } = await db.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: false,
    user_metadata: { signup_app: 'together' },
  });

  if (error && !isDuplicateUser(error.message)) {
    throw new AppError('INTERNAL_ERROR', 'Your Kivelle account could not be created.', 500, true);
  }

  if(!error&&created.user){
    const now=new Date().toISOString(),displayName=input.email.split('@')[0]?.slice(0,50)||'You';
    const profile=await db.from('together_profiles').insert({
      user_id:created.user.id,
      display_name:displayName,
      date_of_birth:input.dateOfBirth,
      age_verified_at:now,
      adult_eligible_at:now,
      adult_eligibility_method:'self_declared_dob_v2',
      content_preferences:{contentMode:'explicit',romanceEnabled:true,matureContentEnabled:false,explicitContentEnabled:true,suggestiveMediaEnabled:false,nudityMediaEnabled:false,explicitMediaEnabled:false},
      onboarding_completed_at:null,
      updated_at:now,
    });
    if(profile.error){
      await db.auth.admin.deleteUser(created.user.id);
      throw new AppError('INTERNAL_ERROR','Your Kivelle account could not be prepared.',500,true);
    }
  }

  // Keep new and existing addresses indistinguishable to callers.
  return json({ data: { needsEmailConfirmation: true }, correlationId }, 202, correlationId);
});

function isDuplicateUser(message: string) {
  return /already|registered|exists|duplicate/i.test(message);
}

async function fingerprint(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
