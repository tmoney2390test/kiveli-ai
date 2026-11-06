import { assertEquals } from 'jsr:@std/assert';
import { voiceNoteNeedsAdultAccess } from './voice-note-access.ts';

Deno.test('voice notes for restricted text require an adult web session',()=>{
  assertEquals(voiceNoteNeedsAdultAccess({content:'A private message.',content_rating:'explicit'}),true);
  assertEquals(voiceNoteNeedsAdultAccess({content:'A private message.',visibility_scope:'web_adult'}),true);
  assertEquals(voiceNoteNeedsAdultAccess({canonical_text:'A private message.',content_rating:'explicit'}),true);
  assertEquals(voiceNoteNeedsAdultAccess({content:'I want to have sex with you.',content_rating:'safe'}),true);
  assertEquals(voiceNoteNeedsAdultAccess({content:'Fuck, that was a bad day.',content_rating:'safe'}),false);
  assertEquals(voiceNoteNeedsAdultAccess({content:'Cock.',content_rating:'safe'}),false);
  assertEquals(voiceNoteNeedsAdultAccess({content:'See you at the cafe.',content_rating:'safe',visibility_scope:'all'}),false);
});
