export const CHAT_ARCHIVE_RETENTION_DAYS=30;
const DAY_MS=24*60*60*1000;

export function conversationArchiveFields(now:Date):{archived_at:string;user_archived_at:string;restore_until:string}{
  const archivedAt=now.toISOString();
  return{
    archived_at:archivedAt,
    user_archived_at:archivedAt,
    restore_until:new Date(now.getTime()+CHAT_ARCHIVE_RETENTION_DAYS*DAY_MS).toISOString(),
  };
}

export function conversationArchiveExpired(restoreUntil:string|null|undefined,now:Date):boolean{
  if(!restoreUntil)return true;
  const deadline=new Date(restoreUntil).getTime();
  return !Number.isFinite(deadline)||deadline<=now.getTime();
}
