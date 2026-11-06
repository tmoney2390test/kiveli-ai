import type { PlaybackProgress } from './playbackCaptions';

/** AudioContext timestamps include scheduling gaps; elapsed wall time does not. */
export class PlaybackClock {
  private turns = new Map<string, { chunks: { start: number; duration: number }[]; finished: boolean }>();
  add(turnId: string, startSeconds: number, durationSeconds: number) {
    const turn = this.turns.get(turnId) ?? { chunks: [], finished: false };
    turn.chunks.push({ start: startSeconds, duration: durationSeconds }); this.turns.set(turnId, turn);
  }
  end(turnId: string) { const turn = this.turns.get(turnId); if (turn) turn.finished = true; }
  sample(nowSeconds: number): PlaybackProgress[] {
    const events: PlaybackProgress[] = [];
    for (const [turnId, turn] of this.turns) {
      const totalMs = turn.chunks.reduce((n, c) => n + c.duration * 1000, 0);
      const playedMs = turn.chunks.reduce((n, c) => n + Math.max(0, Math.min(c.duration, nowSeconds - c.start)) * 1000, 0);
      const done = turn.finished && playedMs >= totalMs - .01;
      events.push({ turnId, playedMs, totalMs, done });
      if (done) this.turns.delete(turnId);
    }
    return events;
  }
  get pending() { return this.turns.size > 0; }
  clear() { this.turns.clear(); }
}
