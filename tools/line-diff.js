'use strict';

function splitLines(text) {
  const value = String(text == null ? '' : text).replace(/\r\n/g, '\n');
  if (value === '') return [];
  const lines = value.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Build a compact line diff with unified-style prefixes. */
function buildLineDiff(before, after) {
  const oldLines = splitLines(before);
  const newLines = splitLines(after);
  const rows = [];
  const width = newLines.length + 1;
  const lcs = Array.from({ length: oldLines.length + 1 }, () => new Uint32Array(width));

  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      lcs[i][j] = oldLines[i] === newLines[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      rows.push({ type: 'context', text: oldLines[i] });
      i++;
      j++;
    } else if (j < newLines.length && (i === oldLines.length || lcs[i][j + 1] > lcs[i + 1][j])) {
      rows.push({ type: 'added', text: newLines[j++] });
    } else {
      rows.push({ type: 'removed', text: oldLines[i++] });
    }
  }
  return rows;
}

module.exports = { buildLineDiff, splitLines };
