import { describe, expect, it, vi } from 'vitest';
import { PlaybackCaptions, currentCaptionSentence, parseAudioTimestamps } from './playbackCaptions';
import { PlaybackClock } from './playbackClock';

const timing = (text: string) => ({graph_chars: [...text], graph_times: [...text].map((_, i) => [i / 10, (i + 1) / 10])});
function setup(text = 'Hello there. Good morning.') {
  const emit = vi.fn(), captions = new PlaybackCaptions(emit);
  captions.transcript('assistant', text, true, 'a');
  captions.audio('a', text.length * 100, timing(text));
  captions.endAudio('a');
  const at = (playedMs: number, done = false) => captions.progress({turnId:'a',playedMs,totalMs:text.length * 100,done});
  return { emit, captions, at };
}
describe('captions follow heard audio', () => {
  it('hides future text and reveals whole words in the current sentence only', () => {
    const { emit, at } = setup();
    expect(emit).not.toHaveBeenCalled();
    at(0); at(499); expect(emit).not.toHaveBeenCalled();
    at(500); expect(emit).toHaveBeenLastCalledWith({role:'assistant',content:'Hello'});
    at(1200); expect(emit).toHaveBeenLastCalledWith({role:'assistant',content:'Hello there.'});
    at(1700); expect(emit).toHaveBeenLastCalledWith({role:'assistant',content:'Good'});
    at(2600, true); expect(emit).toHaveBeenLastCalledWith({role:'assistant',content:'Good morning.'});
  });
  it('does not reveal a word split across audio chunks until it has been heard', () => {
    const emit = vi.fn(), captions = new PlaybackCaptions(emit);
    captions.audio('a', 300, timing('Hel'));
    captions.progress({turnId:'a',playedMs:300,totalMs:300,done:false});
    expect(emit).not.toHaveBeenCalled();
    captions.audio('a', 300, timing('lo '));
    captions.progress({turnId:'a',playedMs:499,totalMs:600,done:false});
    expect(emit).not.toHaveBeenCalled();
    captions.progress({turnId:'a',playedMs:500,totalMs:600,done:false});
    expect(emit).toHaveBeenLastCalledWith({role:'assistant',content:'Hello'});
  });
  it('cuts off interrupted words and ignores delayed finals/audio from that turn', () => {
    const { emit, captions, at } = setup(); at(500); captions.interrupt(); emit.mockClear();
    captions.transcript('assistant','Hello there. Good morning.',true,'a'); at(2500,true);
    captions.audio('a', 800, timing('ignored '));
    expect(emit).not.toHaveBeenCalled();
    captions.transcript('user','Actually, wait.',true,'user');
    expect(emit).toHaveBeenLastCalledWith({role:'user',content:'Actually, wait.'});
  });
  it('does not replace audible captions with late user recognition', () => {
    const { emit, captions, at }=setup(); at(500); emit.mockClear();
    captions.transcript('user','Earlier question.',true,'user');
    expect(emit).not.toHaveBeenCalled();
  });
  it('paces untimed Express transcripts through playback instead of dumping the final', () => {
    const emit=vi.fn(), captions=new PlaybackCaptions(emit);
    captions.transcript('assistant','Hello there. Good morning.',true,'a');
    captions.audio('a',2500); captions.endAudio('a');
    expect(emit).not.toHaveBeenCalled();
    captions.progress({turnId:'a',playedMs:700,totalMs:2500,done:false});
    expect(emit).toHaveBeenLastCalledWith({role:'assistant',content:'Hello'});
    captions.progress({turnId:'a',playedMs:2500,totalMs:2500,done:true});
    expect(emit).toHaveBeenLastCalledWith({role:'assistant',content:'Good morning.'});
  });
  it('does not mistake partial received audio for the full response duration', () => {
    const emit=vi.fn(), captions=new PlaybackCaptions(emit);
    captions.transcript('assistant','Hello there. A lot more will follow.',true,'a'); captions.audio('a',100);
    captions.progress({turnId:'a',playedMs:100,totalMs:100,done:false}); expect(emit).not.toHaveBeenCalled();
  });
  it('handles sentence boundaries without breaking titles and numbers', () => {
    expect(currentCaptionSentence('I saw Dr. Jones at 7.30. He')).toBe('He');
    expect(currentCaptionSentence('I saw Dr. Jones')).toBe('I saw Dr. Jones');
    expect(currentCaptionSentence('Are you here? Yes,')).toBe('Yes,');
  });
  it('rejects malformed timing metadata', () => {
    expect(parseAudioTimestamps({graph_chars:['a'],graph_times:[]})).toBeUndefined();
    expect(parseAudioTimestamps({graph_chars:['a'],graph_times:[[1,0]]})).toBeUndefined();
    expect(parseAudioTimestamps(timing('hi'))).toEqual(timing('hi'));
  });
});
describe('audio playback clock', () => {
  it('waits for scheduled audio, pauses through buffering gaps and finishes after drain', () => {
    const clock = new PlaybackClock(); clock.add('a',10,1); clock.add('a',12,1); clock.end('a');
    expect(clock.sample(9)[0]!.playedMs).toBe(0);
    expect(clock.sample(10.5)[0]!.playedMs).toBe(500);
    expect(clock.sample(11.8)[0]).toMatchObject({playedMs:1000,done:false});
    expect(clock.sample(12.5)[0]!.playedMs).toBe(1500);
    expect(clock.sample(13)[0]).toMatchObject({playedMs:2000,done:true});
    expect(clock.pending).toBe(false);
  });
  it('never advances on a suspended audio clock and drops cancelled work', () => {
    const clock=new PlaybackClock(); clock.add('a',0,2);
    expect(clock.sample(.5)).toEqual(clock.sample(.5));
    clock.clear(); expect(clock.sample(10)).toEqual([]);
  });
});
