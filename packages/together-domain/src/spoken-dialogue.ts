/**
 * Extract dialogue without speaking roleplay markup or stage directions.
 * An unfinished action is withheld, so this is safe to use on streaming text.
 * Keep trailing whitespace until the caller finishes the turn: trimming every
 * delta would join words that arrive in separate provider chunks.
 */
export function spokenDialogueText(text: string): string {
  let output = '', cursor = 0;
  while (cursor < text.length) {
    const character = text[cursor]!;
    const previous = cursor > 0 ? text[cursor - 1]! : '';
    if (character === '[' || character === '(') {
      const close = text.indexOf(character === '[' ? ']' : ')', cursor + 1);
      if (close < 0) break;
      output += ' ';
      cursor = close + 1;
      continue;
    }
    if ((character === '*' || character === '_' || character === '`') && !/[\p{L}\p{N}]/u.test(previous)) {
      let start = cursor + 1;
      while (text[start] === character) start++;
      const marker = text.slice(cursor, start);
      const close = text.indexOf(marker, start);
      if (close < 0) break;
      output += ' ';
      cursor = close + marker.length;
      continue;
    }
    if (character === '<') {
      const tagEnd = text.indexOf('>', cursor);
      if (tagEnd < 0) break;
      const tag = /^<(i|em|think)\s*>$/i.exec(text.slice(cursor, tagEnd + 1));
      if (tag) {
        const closingTag = `</${tag[1]!.toLowerCase()}>`;
        const close = text.toLowerCase().indexOf(closingTag, tagEnd + 1);
        if (close < 0) break;
        output += ' ';
        cursor = close + closingTag.length;
      } else cursor = tagEnd + 1;
      continue;
    }
    if (!/["“”]/u.test(character)) output += character;
    cursor++;
  }
  return output.replace(/\s+/g, ' ').trimStart();
}
