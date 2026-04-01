import type { SkillGraphNode } from "./types";

export interface EvalScore {
  passed: boolean;
  confidence: number;
  reasons: string[];
  matchedKeywords: string[];
  missedKeywords: string[];
}

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "must", "ought",
  "i", "me", "my", "you", "your", "he", "she", "it", "we", "they",
  "this", "that", "these", "those", "am", "or", "and", "but", "if",
  "of", "at", "by", "for", "with", "about", "to", "from", "in", "on",
  "not", "no", "so", "up", "out", "just", "than", "then", "too",
  "very", "also", "its", "his", "her", "our", "their", "into",
  "each", "both", "all", "any", "few", "more", "most", "other",
  "some", "such", "only", "own", "same", "when", "where", "how",
  "what", "which", "who", "whom", "why", "as", "until", "while",
  "during", "before", "after", "above", "below", "between", "through",
]);

const NEGATION_PATTERNS = [
  /should\s+not/i,
  /must\s+not/i,
  /out[- ]of[- ]scope/i,
  /does\s+not/i,
  /cannot/i,
  /can't/i,
  /won't/i,
  /refuse/i,
  /reject/i,
  /decline/i,
  /politely/i,
  /graceful/i,
  /recognize.*not.*support/i,
];

export function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // Also extract multi-word phrases (bigrams) for domain terms
  const tokens = text.toLowerCase().replace(/-/g, " ").split(/\s+/);
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i].replace(/[^a-z0-9-]/g, "");
    const b = tokens[i + 1].replace(/[^a-z0-9-]/g, "");
    if (a.length > 2 && b.length > 2 && !STOP_WORDS.has(a) && !STOP_WORDS.has(b)) {
      bigrams.push(`${a} ${b}`);
    }
  }

  // Cap bigrams to avoid diluting unigram match ratio
  const maxBigrams = Math.max(2, Math.floor(words.length / 2));
  return [...new Set([...words, ...bigrams.slice(0, maxBigrams)])];
}

function isNegationExpectation(expectedBehavior: string): boolean {
  return NEGATION_PATTERNS.some((p) => p.test(expectedBehavior));
}

function scoreNegation(response: string, expectedBehavior: string): EvalScore {
  const responseLower = response.toLowerCase();

  const fulfillmentSignals = [
    /here.*(?:result|answer|information)/i,
    /i(?:'ve| have) (?:found|fetched|retrieved|completed)/i,
    /successfully/i,
  ];

  const refusalSignals = [
    /(?:can't|cannot|unable to|don't|do not|outside|beyond)/i,
    /(?:not.*(?:able|support|handle|capable))/i,
    /(?:apologize|sorry|unfortunately)/i,
    /(?:suggest|recommend|try|contact)/i,
    /(?:out.*scope|not.*within)/i,
  ];

  const fulfills = fulfillmentSignals.some((p) => p.test(responseLower));
  const refuses = refusalSignals.some((p) => p.test(responseLower));

  if (refuses && !fulfills) {
    return {
      passed: true,
      confidence: 0.8,
      reasons: ["Agent correctly refused or redirected an out-of-scope request"],
      matchedKeywords: ["refusal-detected"],
      missedKeywords: [],
    };
  }

  if (fulfills && !refuses) {
    return {
      passed: false,
      confidence: 0.7,
      reasons: ["Agent attempted to fulfill a request it should have refused"],
      matchedKeywords: [],
      missedKeywords: ["expected-refusal"],
    };
  }

  return {
    passed: false,
    confidence: 0.4,
    reasons: ["Ambiguous response — could not determine if agent properly refused"],
    matchedKeywords: [],
    missedKeywords: ["clear-refusal"],
  };
}

export function scoreEvalResponse(
  response: string,
  expectedBehavior: string,
  context?: { skillGraph?: SkillGraphNode[]; agentRules?: string[] },
): EvalScore {
  if (!response || response.trim().length === 0) {
    return {
      passed: false,
      confidence: 1.0,
      reasons: ["No response received from agent"],
      matchedKeywords: [],
      missedKeywords: extractKeywords(expectedBehavior),
    };
  }

  // Handle negation/out-of-scope expectations differently
  if (isNegationExpectation(expectedBehavior)) {
    return scoreNegation(response, expectedBehavior);
  }

  const expectedKeywords = extractKeywords(expectedBehavior);
  if (expectedKeywords.length === 0) {
    return {
      passed: true,
      confidence: 0.5,
      reasons: ["No keywords to match against — auto-passing with low confidence"],
      matchedKeywords: [],
      missedKeywords: [],
    };
  }

  const responseLower = response.toLowerCase().replace(/-/g, " ");
  const matched: string[] = [];
  const missed: string[] = [];

  for (const kw of expectedKeywords) {
    if (responseLower.includes(kw)) {
      matched.push(kw);
    } else {
      missed.push(kw);
    }
  }

  // Check skill references if context is available
  const reasons: string[] = [];
  let skillBonus = 0;

  if (context?.skillGraph) {
    const referencedSkills = context.skillGraph.filter(
      (s) => responseLower.includes(s.skill_id) || responseLower.includes(s.name.toLowerCase()),
    );
    if (referencedSkills.length > 0) {
      skillBonus = 0.1;
      reasons.push(`Referenced skills: ${referencedSkills.map((s) => s.name).join(", ")}`);
    }
  }

  const matchRatio = matched.length / expectedKeywords.length;
  const confidence = Math.min(1, matchRatio + skillBonus);

  if (matchRatio >= 0.5) {
    reasons.unshift(`Matched ${matched.length}/${expectedKeywords.length} expected keywords`);
  } else {
    reasons.unshift(`Only matched ${matched.length}/${expectedKeywords.length} expected keywords`);
  }

  if (missed.length > 0 && missed.length <= 5) {
    reasons.push(`Missing: ${missed.slice(0, 5).join(", ")}`);
  }

  const passed = confidence >= 0.5;

  return { passed, confidence, reasons, matchedKeywords: matched, missedKeywords: missed };
}
