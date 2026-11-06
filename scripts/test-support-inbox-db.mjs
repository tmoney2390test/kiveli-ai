import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const migration = (name) =>
  readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const db = new PGlite();
const owner = crypto.randomUUID(), other = crypto.randomUUID(), staff = crypto.randomUUID();
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table together_support_tickets(id uuid primary key default gen_random_uuid(),ticket_number bigserial,user_id uuid not null references auth.users(id) on delete cascade,category text,subject text,message text,status text default 'open',priority text default 'normal',correlation_id text,conversation_id uuid,metadata jsonb default '{}',created_at timestamptz default now(),first_response_at timestamptz,resolved_at timestamptz,updated_at timestamptz default now());
 create table together_ops_ticket_events(id uuid primary key default gen_random_uuid(),ticket_id uuid references together_support_tickets(id) on delete cascade,actor_user_id uuid,event_type text,previous_state jsonb,next_state jsonb);
 create table together_conversations(id uuid primary key,user_id uuid);
 create table together_messages(id uuid primary key,conversation_id uuid);
 create table together_generated_media(id uuid primary key,user_id uuid);
 create table together_push_tokens(id uuid primary key default gen_random_uuid(),user_id uuid,active boolean);
 create table together_notification_preferences(user_id uuid primary key,push_enabled boolean);
 create table together_push_deliveries(id uuid primary key default gen_random_uuid(),user_id uuid,push_token_id uuid,status text,expires_at timestamptz,next_attempt_at timestamptz,metadata jsonb);
 create table together_storage_cleanup_jobs(user_id uuid,bucket_id text,storage_path text,status text,attempt_count int);
 create table together_email_outbox(event_key text primary key,user_id uuid,kind text,payload jsonb);`,
  );
  await db.exec(migration('20260914195956_support_portal_replies.sql'));
  const base = migration('20260916170616_support_recovery_actions.sql');
  await db.exec(
    base.slice(
      base.indexOf('create function public.kivelle_create_support_ticket'),
      base.lastIndexOf('commit;'),
    ),
  );
  const email = migration('20260914213704_transactional_email_outbox.sql');
  await db.exec(
    email.slice(
      email.indexOf('create function public.kivelle_queue_transactional_email'),
      email.indexOf('create trigger membership_welcome_email'),
    ),
  );
  await db.exec(migration('20261026171914_support_inbox_attachments_notifications.sql'));
  await db.query('insert into auth.users values($1),($2),($3)', [owner, other, staff]);
  await db.query('insert into together_push_tokens(user_id,active) values($1,true);', [owner]);
  await db.query('insert into together_notification_preferences values($1,true)', [owner]);
  const image = async (user = owner, status = 'ready') => {
    const id = crypto.randomUUID();
    await db.query(
      'insert into together_support_attachments(id,user_id,request_id,storage_path,byte_size,width,height,status) values($1,$2,$1,$3,100,100,100,$4)',
      [id, user, user + '/' + id + '.jpg', status],
    );
    return id;
  };
  const create = async (
    { key = crypto.randomUUID(), user = owner, ids = [], subject = 'Photo failed' } = {},
  ) =>
    (await db.query(
      'select kivelli_create_support_request($1,$2,$3,$4,$5,null,null,$6,$7) result',
      [user, key, 'bug', subject, 'The photo never arrived.', '{}', ids],
    )).rows[0].result;
  const reply = async (
    ticket,
    {
      key = crypto.randomUUID(),
      user = owner,
      isSupport = false,
      ids = [],
      message = 'More details here',
    } = {},
  ) =>
    (await db.query('select kivelli_reply_support_request($1,$2,$3,$4,$5,$6) id', [
      ticket,
      user,
      isSupport,
      message,
      key,
      ids,
    ])).rows[0].id;
  const inbox = async (user = owner, filter = 'all', search = '', cursor = {}) =>
    (await db.query('select kivelli_support_inbox($1,$2,$3,$4,$5) result', [
      user,
      filter,
      search,
      cursor.created_at ?? null,
      cursor.id ?? null,
    ])).rows[0].result;
  const foreign = await image(other), own = await image(), pending = await image(owner, 'pending');
  for (
    const ids of [
      [foreign],
      [pending],
      [own, own],
      Array.from({ length: 4 }, () => crypto.randomUUID()),
    ]
  ) await assert.rejects(() => create({ ids }), /SUPPORT_ATTACHMENT/);
  assert.equal(
    (await db.query('select count(*) n from together_support_tickets')).rows[0].n,
    0,
    'Failed attachment claim rolls back ticket, events, emails',
  );
  assert.equal((await db.query('select count(*) n from together_email_outbox')).rows[0].n, 0);
  const key = crypto.randomUUID(), first = await create({ key, ids: [own] });
  assert.equal((await create({ key, ids: [own] })).ticket.id, first.ticket.id);
  await assert.rejects(() => create({ key, ids: [] }), /SUPPORT_REQUEST_CONFLICT/);
  await assert.rejects(() => create({ ids: [own] }), /SUPPORT_ATTACHMENT_UNAVAILABLE/);
  const ticket = first.ticket.id;
  const receipt =
    (await db.query("select payload from together_email_outbox where kind='support_received'"))
      .rows[0].payload;
  assert.equal(receipt.ticketId, ticket);
  await assert.rejects(() => reply(ticket, { user: other }), /unavailable/);
  const rkey = crypto.randomUUID(),
    r1 = await reply(ticket, {
      key: rkey,
      user: staff,
      isSupport: true,
      message: 'We are looking into this.',
    });
  assert.equal(
    await reply(ticket, {
      key: rkey,
      user: staff,
      isSupport: true,
      message: 'We are looking into this.',
    }),
    r1,
  );
  assert.equal((await db.query('select count(*) n from together_push_deliveries')).rows[0].n, 1);
  assert.equal((await inbox()).counts.unread, 1);
  assert.equal(
    (await db.query('select kivelli_support_unread($1) result', [owner])).rows[0].result.count,
    1,
  );
  assert.equal(
    (await db.query('select kivelli_support_unread($1) result', [other])).rows[0].result.count,
    0,
  );
  const before =
    (await db.query('select created_at from together_support_replies where id=$1', [r1])).rows[0]
      .created_at;
  await db.query('select kivelli_read_support_request($1,$2,$3)', [other, ticket, before]);
  assert.equal((await inbox()).counts.unread, 1);
  const r2 = await reply(ticket, { user: staff, isSupport: true, message: 'Please try again.' });
  const after =
    (await db.query('select created_at from together_support_replies where id=$1', [r2])).rows[0]
      .created_at;
  await db.query('select kivelli_read_support_request($1,$2,$3)', [owner, ticket, before]);
  assert.equal(
    (await inbox()).counts.unread,
    1,
    'Reading an older snapshot must not clear a newer reply',
  );
  await db.query('select kivelli_read_support_request($1,$2,$3)', [owner, ticket, after]);
  assert.equal((await inbox()).counts.unread, 0);
  assert.equal(
    (await db.query('select payload from together_email_outbox where event_key=$1', [
      'support-reply:' + r2,
    ])).rows[0].payload.ticketId,
    ticket,
  );
  await db.query(
    "update together_support_tickets set status='resolved',resolved_at=now() where id=$1",
    [ticket],
  );
  const followup = await image();
  await reply(ticket, { ids: [followup] });
  assert.equal(
    (await db.query('select status from together_support_tickets where id=$1', [ticket])).rows[0]
      .status,
    'open',
  );
  for (let n = 0; n < 64; n++) {
    await create({ subject: n === 0 ? '100% complete' : `Request ${n}` });
  }
  let page = await inbox(), seen = new Set(), pages = 0;
  while (page.tickets.length) {
    for (const row of page.tickets.slice(0, 30)) {
      assert.ok(!seen.has(row.id));
      seen.add(row.id);
    }
    pages++;
    if (page.tickets.length <= 30) break;
    page = await inbox(owner, 'all', '', page.tickets[29]);
  }
  assert.equal(seen.size, 65);
  assert.equal(pages, 3);
  assert.equal(
    (await inbox(owner, 'all', '%')).tickets.length,
    1,
    'Search treats percent literally',
  );
  assert.equal((await inbox(other)).tickets.length, 0);
  await db.exec('set role authenticated');
  await assert.rejects(() => inbox(owner), /permission denied/);
  await assert.rejects(
    () => db.query('select * from together_support_attachments'),
    /permission denied/,
  );
  await db.exec('reset role');
  await db.query(
    "update together_support_tickets set metadata=metadata||jsonb_build_object('retentionPurgedAt',now()) where id=$1",
    [ticket],
  );
  assert.equal(
    (await db.query('select count(*) n from together_support_attachments where ticket_id=$1', [
      ticket,
    ])).rows[0].n,
    0,
    'Retention purge removes the associated screenshots',
  );
  assert.equal(
    (await db.query('select count(*) n from together_storage_cleanup_jobs')).rows[0].n,
    2,
  );
  await db.query('delete from auth.users where id=$1', [owner]);
  assert.equal(
    (await db.query('select count(*) n from together_support_attachments where user_id=$1', [
      owner,
    ])).rows[0].n,
    0,
  );
  assert.equal(
    (await db.query('select count(*) n from together_storage_cleanup_jobs')).rows[0].n,
    3,
  );
  console.log(
    'Support inbox SQL passed: private ownership, atomic image claims, retry conflicts, notification dedupe, exact links, unread race, reopen, 65-ticket pagination, literal search, account deletion cleanup.',
  );
} finally {
  await db.close();
}
