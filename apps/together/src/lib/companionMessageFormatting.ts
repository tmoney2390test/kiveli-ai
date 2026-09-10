export type CompanionTextSegment={text:string;italic?:boolean;bold?:boolean};
type Options={streaming?:boolean;speakerName?:string};
const quotePattern=/“[^”]*”|"[^"\n]*"|«[^»]*»|「[^」]*」|『[^』]*』/g;
const markupPattern=/`[^`]*`|(?<![\\*])\*\*[^*\n]+\*\*(?!\*)|(?<![\\*\p{L}\p{N}])\*[^*]+\*(?!\*)|(?<![\\_\p{L}\p{N}])_[^_\n]+_(?![\p{L}\p{N}_])/gu;
const escapeRegex=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function narrative(text:string,speakerName?:string){
 const names=speakerName?[speakerName,speakerName.split(' ')[0]!].map(escapeRegex).join('|'):'';
 const subject=`(?:I|she|he|they${names?'|'+names:''})`;
 return new RegExp(`^\\s*[,;—–-]?\\s*${subject}\\s+(?:(?:softly|quietly|gently|slowly|briefly|then)\\s+)?(?:murmur|whisper|say|ask|reply|add|write|smile|grin|laugh|chuckle|sigh|nod|shrug|lean|reach|brush|turn|glance|look|watch|step|sit|stand|take|place|rest|keep|let|send|invite|lift|raise|lower|tilt|tuck|pull|move|press|slip|hold|run|trace|pause|meet|squeeze)(?:s|es|ed|ing)?\\b`,'i').test(text);
}
function onlyMarkup(text:string){return text.replace(markupPattern,'').trim()==='';}
function quotationParts(text:string){return [...text.matchAll(quotePattern)].map(match=>({start:match.index!,end:match.index!+match[0].length,text:match[0].slice(1,-1)}));}
/** Presentation only: stored messages and user-authored text are never rewritten. */
export function formatCompanionMessage(text:string,options:Options={}):CompanionTextSegment[]{
 const result:CompanionTextSegment[]=[];
 const push=(value:string,italic=false,bold=false)=>{if(!value)return;const last=result.at(-1);if(last&&Boolean(last.italic)===italic&&Boolean(last.bold)===bold)last.text+=value;else result.push({text:value,...(italic?{italic:true}:{}),...(bold?{bold:true}:{})});};
 const emphasis=(value:string,baseItalic=false)=>{
  let cursor=0;
  for(const match of value.matchAll(markupPattern)){push(value.slice(cursor,match.index),baseItalic);const token=match[0];if(token.startsWith('`'))push(token,baseItalic);else if(token.startsWith('**'))push(token.slice(2,-2),baseItalic,true);else push(token.slice(1,-1),true);cursor=match.index!+token.length;}
  const tail=value.slice(cursor);
  if(options.streaming){const unfinished=tail.match(/(^|\s)\*([^*]*)$/);if(unfinished){const index=unfinished.index!+unfinished[1]!.length;push(tail.slice(0,index),baseItalic);push(tail.slice(index+1),true);return;}}
  push(tail,baseItalic);
 };
 const paragraphs=text.split(/(\n\s*\n)/);
 const quotedNarrative=paragraphs.some(paragraph=>{
  const quotes=quotationParts(paragraph);let cursor=0;return quotes.some(quote=>{const before=paragraph.slice(cursor,quote.start);cursor=quote.end;return narrative(before,options.speakerName);})||(quotes.length>0&&narrative(paragraph.slice(quotes.at(-1)!.end),options.speakerName));
 });
 for(const paragraph of paragraphs){
  if(!paragraph.trim()){push(paragraph);continue;}
  const quotes=quotationParts(paragraph);let cursor=0;
  const outside=quotes.map(quote=>{const value=paragraph.slice(cursor,quote.start);cursor=quote.end;return value;});outside.push(paragraph.slice(cursor));
  const narrativeQuotes=quotes.length>0&&outside.some(value=>narrative(value,options.speakerName));
  const unwrap=quotes.length>0&&(narrativeQuotes||outside.every(value=>!value.trim()||onlyMarkup(value)));
  if(unwrap){cursor=0;for(const quote of quotes){emphasis(paragraph.slice(cursor,quote.start),narrativeQuotes);emphasis(quote.text);cursor=quote.end;}emphasis(paragraph.slice(cursor),narrativeQuotes);continue;}
  const trimmed=paragraph.trim(),singleWrapper=(trimmed.startsWith("'")&&trimmed.endsWith("'"))||(trimmed.startsWith('‘')&&trimmed.endsWith('’'));
  if(singleWrapper&&trimmed.length>2){emphasis(paragraph.replace(trimmed,trimmed.slice(1,-1)));continue;}
  let value=paragraph;
  if(options.streaming)value=value.replace(/^(\s*)[“"«「『]/,'$1').replace(/(\*\s*)[“"«「『](?=[^”"»」』]*$)/,'$1');
  emphasis(value,quotedNarrative&&narrative(paragraph,options.speakerName));
 }
 return result;
}
