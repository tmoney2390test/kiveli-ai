import { describe, expect, it } from 'vitest';
import { dictationAudioMetadata, mergeDictationTranscript } from './dictation';

describe('chat dictation', () => {
  it('inserts a clean transcript into an empty draft', () => {
    expect(mergeDictationTranscript('', '  Hello   there.  ')).toBe('Hello there.');
  });

  it('appends dictation without sending or replacing the existing draft', () => {
    expect(mergeDictationTranscript('Meet me after work.  ', 'I can be there at seven.'))
      .toBe('Meet me after work. I can be there at seven.');
  });

  it('uses formats accepted by the transcription endpoint on web and native', () => {
    expect(dictationAudioMetadata('blob:recording', true)).toEqual({ contentType: 'audio/webm', fileName: 'dictation.webm' });
    expect(dictationAudioMetadata('file:///cache/recording.m4a')).toEqual({ contentType: 'audio/mp4', fileName: 'dictation.m4a' });
  });
});
