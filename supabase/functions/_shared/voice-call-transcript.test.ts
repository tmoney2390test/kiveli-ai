import { voiceCallNeedsTranscriptFinalization } from './voice-call-transcript.ts';

Deno.test('normal call completion always finalizes canonical transcript history',()=>{
  assert(voiceCallNeedsTranscriptFinalization({isFailure:false,incomingEventCount:0,transcriptStatus:'pending'}));
});

Deno.test('failed calls preserve received or locally supplied final turns',()=>{
  assert(voiceCallNeedsTranscriptFinalization({isFailure:true,incomingEventCount:2,transcriptStatus:'pending'}));
  assert(voiceCallNeedsTranscriptFinalization({isFailure:true,incomingEventCount:0,transcriptStatus:'receiving'}));
  assert(!voiceCallNeedsTranscriptFinalization({isFailure:true,incomingEventCount:0,transcriptStatus:'pending'}));
});

function assert(value:unknown):asserts value{if(!value)throw new Error('assertion_failed');}
