const PROFANITY_TERMS = [
  "motherfucker", "motherfuck", "bullshit", "asshole", "bastard",
  "bitch", "fuck", "shit", "cunt", "dick", "pussy", "whore",
  "slut", "crap", "damn", "piss", "ass", "dickhead"
];

function termPattern(term: string): RegExp {
  const letters = [...term]
    .map(char => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "+")
    .join("[^\\p{L}\\p{N}]*");
  return new RegExp("(^|[^\\p{L}\\p{N}])(" + letters + ")(?=$|[^\\p{L}\\p{N}])", "giu");
}

/** Masks common profanity, including repeated letters and punctuation/space-separated evasions. */
export function censorProfanity(text: string): string {
  let result = text.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "");
  result = result
    .replace(/f[\s*#@._-]+ck/gi, "fuck")
    .replace(/sh[\s*#@._-]+t/gi, "shit")
    .replace(/b[\s*#@._-]+tch/gi, "bitch")
    .replace(/a[\s*#@._-]{1,3}hole/gi, "asshole")
    .replace(/d[\s*#@._-]+ck/gi, "dick");
  for (const term of PROFANITY_TERMS) {
    result = result.replace(termPattern(term), (_match, prefix: string, word: string) =>
      prefix + word.replace(/\p{L}/gu, "*")
    );
  }
  return result;
}
