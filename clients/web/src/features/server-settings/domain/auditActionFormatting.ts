export function splitAuditActionParts(action: string) {
  const out: Array<
    { type: 'text'; value: string } | { type: 'mention'; value: string }
  > = [];
  const regex = /@([A-Za-z0-9_]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(action))) {
    if (match.index > lastIndex) {
      out.push({ type: 'text', value: action.slice(lastIndex, match.index) });
    }
    out.push({ type: 'mention', value: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < action.length)
    out.push({ type: 'text', value: action.slice(lastIndex) });
  return out;
}
