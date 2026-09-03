import { describe,expect,it } from 'vitest';
import type { GeneratedMedia } from '../types';
import { pendingMediaIds } from './mediaReconciliation';

const media=(id:string,status:GeneratedMedia['status'])=>({id,status} as GeneratedMedia);

describe('pending media recovery',()=>{
  it('polls only unfinished jobs and respects the server batch limit',()=>{
    const rows=[media('ready','ready'),...Array.from({length:22},(_,index)=>media(`pending-${index}`,index%2?'queued':'generating')),media('failed','failed')];
    const ids=pendingMediaIds(rows);
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe('pending-0');
    expect(ids).not.toContain('ready');
    expect(ids).not.toContain('failed');
  });
});
