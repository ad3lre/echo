const UI_LITERAL_START =
  /\b(?:Text|Button|Label|TextField|SecureField|ContentUnavailableView)\(\s*"/g;

function interpolationEnd(text, start) {
  let depth = 1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '"') {
      i = literalContent(text, i + 1).end;
    } else if (text[i] === '\\') {
      i++;
    } else if (text[i] === '(') {
      depth++;
    } else if (text[i] === ')' && --depth === 0) {
      return i;
    }
  }
  return text.length;
}

function literalContent(text, start) {
  let literal = '';
  let interpolated = false;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '"') return { literal, interpolated, end: i };
    if (text[i] === '\\' && text[i + 1] === '(') {
      interpolated = true;
      i = interpolationEnd(text, i + 2);
    } else if (text[i] === '\\') {
      literal += text.slice(i, i + 2);
      i++;
    } else {
      literal += text[i];
    }
  }
  return { literal, interpolated, end: text.length };
}

export function countRawUiCopy(text) {
  let count = 0;
  UI_LITERAL_START.lastIndex = 0;
  let match;
  while ((match = UI_LITERAL_START.exec(text))) {
    const { literal, interpolated, end } = literalContent(
      text,
      UI_LITERAL_START.lastIndex,
    );
    UI_LITERAL_START.lastIndex = end + 1;
    if (interpolated && ['', '@'].includes(literal.trim())) continue;
    count++;
  }
  return count;
}
