export type ChatActionSpan = { text: string; italic: boolean };

/** Interpret paired roleplay asterisks for display without changing stored chat text. */
export function parseChatActionText(text: string): ChatActionSpan[] {
  const spans: ChatActionSpan[] = [];
  let plain = '';
  let cursor = 0;

  const flush = () => {
    if (plain) spans.push({ text: plain, italic: false });
    plain = '';
  };

  while (cursor < text.length) {
    if (text[cursor] === '\\' && text[cursor + 1] === '*') {
      plain += '*';
      cursor += 2;
      continue;
    }
    if (text[cursor] !== '*' || (cursor > 0 && /[\p{L}\p{N}]/u.test(text[cursor - 1]!))) {
      plain += text[cursor];
      cursor++;
      continue;
    }

    const marker = text[cursor + 1] === '*' ? '**' : '*';
    const start = cursor + marker.length;
    if (!text[start] || /\s/u.test(text[start]!)) {
      plain += marker;
      cursor = start;
      continue;
    }

    let close = start;
    while ((close = text.indexOf(marker, close)) !== -1) {
      if (text[close - 1] !== '\\' && !/\s/u.test(text[close - 1]!) && (marker === '**' || text[close + 1] !== '*')) break;
      close += marker.length;
    }
    if (close === -1) {
      plain += marker;
      cursor = start;
      continue;
    }

    flush();
    spans.push({ text: text.slice(start, close), italic: true });
    cursor = close + marker.length;
  }
  flush();
  return spans;
}
