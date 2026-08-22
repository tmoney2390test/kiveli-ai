export const CHAT_ARCHIVE_RETENTION_DAYS=30;
const DAY_MS=24*60*60*1000;

export function archiveDaysRemaining(restoreUntil:string|null|undefined,now=new Date()):number{
  if(!restoreUntil)return 0;
  const remaining=new Date(restoreUntil).getTime()-now.getTime();
  return Number.isFinite(remaining)?Math.max(0,Math.ceil(remaining/DAY_MS)):0;
}

export function archiveRetentionLabel(restoreUntil:string|null|undefined,now=new Date()):string{
  const days=archiveDaysRemaining(restoreUntil,now);
  if(days<=0)return'Restore window expired';
  return `${days} ${days===1?'day':'days'} left to restore`;
}
