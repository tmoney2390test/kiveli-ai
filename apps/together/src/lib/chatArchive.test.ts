import{describe,expect,it}from'vitest';
import{archiveDaysRemaining,archiveRetentionLabel,CHAT_ARCHIVE_RETENTION_DAYS}from'./chatArchive';

describe('recoverable chat archive',()=>{
  const now=new Date('2026-08-20T12:00:00.000Z');

  it('keeps explicitly removed chats recoverable for thirty days',()=>{
    expect(CHAT_ARCHIVE_RETENTION_DAYS).toBe(30);
    expect(archiveDaysRemaining('2026-09-19T12:00:00.000Z',now)).toBe(30);
    expect(archiveRetentionLabel('2026-09-19T12:00:00.000Z',now)).toBe('30 days left to restore');
  });

  it('rounds partial days up and closes at the deadline',()=>{
    expect(archiveRetentionLabel('2026-08-21T11:59:59.999Z',now)).toBe('1 day left to restore');
    expect(archiveRetentionLabel('2026-08-20T12:00:00.000Z',now)).toBe('Restore window expired');
    expect(archiveDaysRemaining(null,now)).toBe(0);
  });
});
