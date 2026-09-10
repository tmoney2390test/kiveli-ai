import {describe,it,expect} from 'vitest';
import {formatCompanionMessage as format} from './companionMessageFormatting';
const plain=(value:string)=>format(value).map(segment=>segment.text).join('');
describe('companion message presentation',()=>{
 it('italicizes action markup without showing delimiters',()=>expect(format('*I smile.* Hello.')).toEqual([{text:'I smile.',italic:true},{text:' Hello.'}]));
 it('removes only speech wrappers and keeps contractions',()=>{expect(plain('“I’m glad you’re here.”')).toBe('I’m glad you’re here.');expect(plain('"Don\'t go."')).toBe("Don't go.");expect(plain("'Hello.'")).toBe('Hello.');});
 it('formats literary dialogue with intervening narration',()=>expect(format('“The courtyard threshold,” I murmur, keeping my eyes on the model. “The rail break first.”')).toEqual([{text:'The courtyard threshold,'},{text:' I murmur, keeping my eyes on the model. ',italic:true},{text:'The rail break first.'}]));
 it('formats a narrative paragraph before quoted dialogue',()=>expect(format('I send you a sketch. The detail is small.\n\n“Look at the rail,” I write.')).toEqual([{text:'I send you a sketch. The detail is small.',italic:true},{text:'\n\nLook at the rail,'},{text:' I write.',italic:true}]));
 it('handles action markup around quoted speech',()=>expect(format('*I lean closer.* “Hello.” *I smile.*')).toEqual([{text:'I lean closer.',italic:true},{text:' Hello. '},{text:'I smile.',italic:true}]));
 it('preserves inline quotations, measurements, links, code and ordinary first-person messages',()=>{for(const value of ['The word “home” matters to me.','I loved "Dune".','It is 6" wide.',"I'm at home. What are you doing?",'https://example.com/my_photo','2*3*4 = 24','`some_code`'])expect(plain(value)).toBe(value);});
 it('keeps nested quoted words inside speech',()=>expect(plain('“I loved "Dune".”')).toBe('I loved "Dune".'));
 it('handles partial streaming actions and speech without markers',()=>{expect(format('*I lean closer',{streaming:true})).toEqual([{text:'I lean closer',italic:true}]);expect(format('“Hello',{streaming:true})).toEqual([{text:'Hello'}]);});
 it('recognizes the named companion without formatting a title',()=>expect(format('The Invitation\n\nFreya invites you inside.\n\n“Come in,” she whispers.',{speakerName:'Freya Vale'}).filter(x=>x.italic).map(x=>x.text)).toEqual(['Freya invites you inside.',' she whispers.']));
 it('supports underscores, bold and multiline actions',()=>{expect(format('_I nod._ **Yes.**')).toEqual([{text:'I nod.',italic:true},{text:' '},{text:'Yes.',bold:true}]);expect(format('*I pause.\nThen smile.*')).toEqual([{text:'I pause.\nThen smile.',italic:true}]);});
});
