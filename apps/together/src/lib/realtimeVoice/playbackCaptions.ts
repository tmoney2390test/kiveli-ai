import type { CallCaption } from './captions';

export type AudioTimestamps = { graph_chars: string[]; graph_times: number[][] };
export type PlaybackProgress = { turnId: string; playedMs: number; totalMs: number; done: boolean; interrupted?: boolean };
type Turn = { text: string; final: boolean; audioFinished: boolean; duration: number; played: number; done: boolean; chars: string; ends: number[]; revealed: number };

export function parseAudioTimestamps(value: unknown): AudioTimestamps | undefined {
  if (!value || typeof value !== 'object') return;
  const { graph_chars: chars, graph_times: times } = value as AudioTimestamps;
  if (!Array.isArray(chars) || !Array.isArray(times) || !chars.length || chars.length > 8000 || chars.length !== times.length) return;
  if (chars.some(c => typeof c !== 'string' || c.length > 16) || times.some(t => !Array.isArray(t) || t.length !== 2 || !t.every(n => Number.isFinite(n) && n >= 0) || t[1]! < t[0]!)) return;
  return { graph_chars: chars, graph_times: times };
}

// Keep punctuation with the sentence just spoken; switch only when the next
// sentence has a visible word. Common titles and decimals are not boundaries.
export function currentCaptionSentence(text: string): string {
  const words = text.trim().split(/\s+/);
  let start = 0;
  for (let i = 0; i < words.length - 1; i++) {
    const word = words[i]!;
    if (/[!?]["'”’)]*$/.test(word) || (/\.["'”’)]*$/.test(word) && !/^(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr|vs|etc|[A-Z])\.$/i.test(word) && !/^(?:[A-Z]\.){2,}$/i.test(word))) start = i + 1;
  }
  return words.slice(start).join(' ');
}

/** Display state is separate from the complete transcript saved in chat history. */
export class PlaybackCaptions {
  private turns = new Map<string, Turn>();
  private cancelled = new Set<string>();
  private active = '';
  private visible = '';
  private role: 'user' | 'assistant' | null = null;
  constructor(private emit: (caption: CallCaption | null) => void) {}
  private turn(id: string): Turn {
    let turn = this.turns.get(id);
    if (!turn) {
      turn = { text: '', final: false, audioFinished: false, duration: 0, played: 0, done: false, chars: '', ends: [], revealed: 0 };
      this.turns.set(id, turn);
      if (this.turns.size > 8) this.turns.delete(this.turns.keys().next().value!);
    }
    return turn;
  }
  transcript(role: 'user' | 'assistant', content: string, final: boolean, id: string) {
    if (role === 'user') {
      // Late STT finals must not overwrite the companion's audible sentence.
      if (final && this.role === 'assistant') return;
      this.show('user', currentCaptionSentence(content));
      return;
    }
    if (this.cancelled.has(id)) return;
    const turn = this.turn(id);
    turn.text = (final ? content : turn.text + content).slice(0, 8000);
    turn.final = final;
    if (this.active === id) this.render(turn);
  }
  audio(id: string, durationMs: number, timing?: AudioTimestamps) {
    if (this.cancelled.has(id)) return;
    const turn = this.turn(id), offset = turn.duration;
    turn.duration += durationMs;
    if (timing) {
      // Provider timestamps are relative to this PCM chunk, not arrival time.
      timing.graph_chars.forEach((char, i) => {
        if (turn.chars.length + char.length > 8000) return;
        turn.chars += char;
        for (let j = 0; j < char.length; j++) turn.ends.push(offset + timing.graph_times[i]![1]! * 1000);
      });
    }
  }
  progress(event: PlaybackProgress) {
    if (event.interrupted) { this.interrupt(); return; }
    if (this.cancelled.has(event.turnId)) return;
    const turn = this.turn(event.turnId);
    turn.played = Math.max(turn.played, Math.min(event.totalMs, event.playedMs));
    turn.done = event.done;
    this.active = event.turnId;
    this.render(turn);
  }
  endAudio(id: string) { if (!this.cancelled.has(id)) this.turn(id).audioFinished = true; }
  interrupt() {
    for (const id of this.turns.keys()) this.cancelled.add(id);
    while (this.cancelled.size > 32) this.cancelled.delete(this.cancelled.values().next().value!);
    this.turns.clear(); this.active = ''; this.visible = ''; this.role = null; this.emit(null);
  }
  reset() { this.interrupt(); this.cancelled.clear(); }
  private render(turn: Turn) {
    if (turn.played <= 0) return;
    let text = '';
    if (turn.chars) {
      const words = [...turn.chars.matchAll(/\S+/g)];
      for (const match of words) {
        const end = match.index! + match[0].length;
        // A chunk may stop halfway through a word. Wait for its boundary.
        if (end === turn.chars.length && !turn.final && !turn.done) break;
        if ((turn.ends[end - 1] ?? Infinity) > turn.played) break;
        text = turn.chars.slice(0, end);
      }
    } else {
      // Express Voice does not provide word alignment. Pace its received text
      // against consumed PCM, never network arrival or a wall-clock animation.
      const words = turn.text.match(/\S+/g) ?? [];
      const weights = words.map(word => Math.max(2, Math.min(12, word.length)) + (/[.!?]$/.test(word) ? 3 : 0));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const estimateMs = Math.max(turn.duration, totalWeight * 70);
      const duration = turn.final && turn.audioFinished && turn.duration > 0 ? turn.duration : estimateMs;
      let cursor = 0, count = 0;
      for (const weight of weights) { cursor += weight; if (cursor / Math.max(1, totalWeight) * duration > turn.played) break; count++; }
      turn.revealed = Math.max(turn.revealed, count);
      text = words.slice(0, turn.revealed).join(' ');
    }
    if (text) this.show('assistant', currentCaptionSentence(text));
  }
  private show(role: 'user' | 'assistant', content: string) {
    if (!content || (content === this.visible && role === this.role)) return;
    this.visible = content; this.role = role; this.emit({ role, content });
  }
}
