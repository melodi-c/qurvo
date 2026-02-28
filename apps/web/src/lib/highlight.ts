export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Parses an HTML snippet containing `<mark>...</mark>` tags into safe text segments.
 *
 * PostgreSQL `ts_headline()` wraps matched terms in `<mark>` / `</mark>`.
 * Instead of rendering raw HTML via `dangerouslySetInnerHTML` (XSS risk),
 * this function splits the string into plain-text segments that can be
 * rendered as React elements — highlighted segments become `<mark>` React
 * elements, while the rest is rendered as escaped text.
 *
 * Any other HTML tags in the input are treated as literal text (escaped by React).
 */
export function parseHighlightedSnippet(html: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  const regex = /<mark>(.*?)<\/mark>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    // Text before the <mark> tag
    if (match.index > lastIndex) {
      segments.push({ text: html.slice(lastIndex, match.index), highlighted: false });
    }
    // The matched (highlighted) text
    segments.push({ text: match[1], highlighted: true });
    lastIndex = regex.lastIndex;
  }

  // Remaining text after the last </mark>
  if (lastIndex < html.length) {
    segments.push({ text: html.slice(lastIndex), highlighted: false });
  }

  return segments;
}
