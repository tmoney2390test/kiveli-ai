import{CHAT_ARCHIVE_RETENTION_DAYS,conversationArchiveExpired,conversationArchiveFields}from'./together-conversation-archive.ts';

function assert(condition:boolean,message:string){if(!condition)throw new Error(message);}

Deno.test('user-deleted chats receive an exact thirty-day restore window',()=>{
  const archived=conversationArchiveFields(new Date('2026-08-20T12:00:00.000Z'));
  assert(CHAT_ARCHIVE_RETENTION_DAYS===30,'retention should remain thirty days');
  assert(archived.archived_at==='2026-08-20T12:00:00.000Z','archive timestamp should use the request clock');
  assert(archived.restore_until==='2026-09-19T12:00:00.000Z','restore deadline should be thirty days later');
});

Deno.test('restore availability closes at the deadline',()=>{
  const deadline='2026-09-19T12:00:00.000Z';
  assert(!conversationArchiveExpired(deadline,new Date('2026-09-19T11:59:59.999Z')),'chat should be restorable before the deadline');
  assert(conversationArchiveExpired(deadline,new Date(deadline)),'chat should expire at the deadline');
  assert(conversationArchiveExpired(null,new Date()),'missing deadlines are not restorable');
});
