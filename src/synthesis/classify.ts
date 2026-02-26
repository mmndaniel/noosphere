export type ContentClass = 'decision' | 'active' | 'speculative' | 'informational';

const DECISION_SIGNALS = [
  /\bdecided\b/i,
  /\bdecision:/i,
  /\blocked\b/i,
  /\bchose\b/i,
  /\bgoing with\b/i,
  /\bconfirmed\b/i,
  /\bfinal\b/i,
  /\bcommitted to\b/i,
  /\bwe will\b/i,
  /\bwon't\b/i,
  /\brejected\b/i,
];

const SPECULATIVE_SIGNALS = [
  /\bconsidering\b/i,
  /\bmight\b/i,
  /\bmaybe\b/i,
  /\bopen question\b/i,
  /\bbrainstorm/i,
  /\bsuggested\b/i,
  /\bcould\b/i,
  /\bexploring\b/i,
  /\bwhat if\b/i,
  /\btrade-?off/i,
  /\balternative/i,
  /\bpossibly\b/i,
];

export function classifyContent(text: string): ContentClass {
  let decisionScore = 0;
  let speculativeScore = 0;

  for (const re of DECISION_SIGNALS) {
    const matches = text.match(new RegExp(re.source, re.flags + 'g'));
    if (matches) decisionScore += matches.length;
  }

  for (const re of SPECULATIVE_SIGNALS) {
    const matches = text.match(new RegExp(re.source, re.flags + 'g'));
    if (matches) speculativeScore += matches.length;
  }

  // Strong decision signal wins if it dominates
  if (decisionScore > 0 && decisionScore >= speculativeScore) return 'decision';
  if (speculativeScore > 0 && speculativeScore > decisionScore) return 'speculative';

  // No strong signal either way — check if it looks like ongoing work
  if (/\bin progress\b/i.test(text) || /\bcontinuation\b/i.test(text) || /\bnext step/i.test(text)) {
    return 'active';
  }

  return 'informational';
}
