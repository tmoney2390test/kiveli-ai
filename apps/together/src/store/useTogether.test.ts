import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot, SnapshotDelta } from '../types';

vi.stubGlobal('__DEV__', false);
vi.mock('../lib/api', () => ({loadSnapshot: vi.fn(), loadCharacterPresence: vi.fn()}));
const { useTogether } = await import('./useTogether');
const { loadSnapshot, loadCharacterPresence } = await import('../lib/api');

function life(id: string): Snapshot {
  return {activeContinuity: {id}, characters: [{id: `${id}-character`}], conversations: [], scheduleEvents: []} as unknown as Snapshot;
}

describe('Life switching during background requests', () => {
  beforeEach(() => {useTogether.getState().clear();vi.resetAllMocks();});

  it('keeps the switched Life when an old full refresh finishes', async () => {
    let finish!: (snapshot: Snapshot) => void;
    vi.mocked(loadSnapshot).mockImplementationOnce(() => new Promise((resolve) => {finish=resolve;}));
    useTogether.getState().setSnapshot(life('main'));
    const pending=useTogether.getState().refresh();
    useTogether.getState().setSnapshot(life('alternate'));
    finish(life('main'));await pending;
    expect(useTogether.getState().snapshot?.activeContinuity?.id).toBe('alternate');
    expect(useTogether.getState().loading).toBe(false);
  });

  it('discards presence results from a Life that was left', async () => {
    let finish!: (value: Awaited<ReturnType<typeof loadCharacterPresence>>) => void;
    vi.mocked(loadCharacterPresence).mockImplementationOnce(() => new Promise((resolve) => {finish=resolve;}));
    useTogether.getState().setSnapshot(life('main'));
    const pending=useTogether.getState().refresh({scope:'presence',characterInstanceId:'main-character'});
    useTogether.getState().setSnapshot(life('alternate'));
    finish({character:{id:'main-character'},scheduleEvents:[]} as unknown as Awaited<ReturnType<typeof loadCharacterPresence>>);await pending;
    expect(useTogether.getState().snapshot?.characters.map((character)=>character.id)).toEqual(['alternate-character']);
  });

  it('does not merge a late dialogue response into another Life', () => {
    useTogether.getState().setSnapshot(life('alternate'));
    useTogether.getState().applyServerDelta({characterInstanceId:'main-character',character:{id:'main-character'},conversation:{id:'main-conversation'}} as SnapshotDelta);
    expect(useTogether.getState().snapshot?.characters.map((character)=>character.id)).toEqual(['alternate-character']);
    expect(useTogether.getState().snapshot?.conversations).toEqual([]);
  });
});
