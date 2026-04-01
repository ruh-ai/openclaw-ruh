import { describe, it, expect } from "vitest";
import { scoreEvalResponse, extractKeywords } from "./eval-scorer";

describe("extractKeywords", () => {
  it("filters stop words and short words", () => {
    const kws = extractKeywords("The agent should search the knowledge base");
    expect(kws).toContain("agent");
    expect(kws).toContain("search");
    expect(kws).toContain("knowledge");
    expect(kws).toContain("base");
    expect(kws).not.toContain("the");
    expect(kws).not.toContain("should");
  });

  it("extracts bigrams", () => {
    const kws = extractKeywords("knowledge base retrieval");
    expect(kws).toContain("knowledge base");
    expect(kws).toContain("base retrieval");
  });

  it("handles empty string", () => {
    expect(extractKeywords("")).toEqual([]);
  });
});

describe("scoreEvalResponse", () => {
  it("scores a matching response as pass", () => {
    const result = scoreEvalResponse(
      "I searched the knowledge base and found the password reset article. Here are the steps to reset your password...",
      "Agent finds the password reset article in the knowledge base and drafts a response with step-by-step instructions.",
    );
    expect(result.passed).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
  });

  it("scores a non-matching response as fail", () => {
    const result = scoreEvalResponse(
      "Hello! How can I help you today?",
      "Agent finds the password reset article in the knowledge base, drafts a response with step-by-step instructions and includes the KB article link.",
    );
    expect(result.passed).toBe(false);
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.missedKeywords.length).toBeGreaterThan(0);
  });

  it("handles empty response", () => {
    const result = scoreEvalResponse("", "Agent should respond with data.");
    expect(result.passed).toBe(false);
    expect(result.confidence).toBe(1.0);
    expect(result.reasons).toContain("No response received from agent");
  });

  it("handles out-of-scope negation correctly — agent refuses", () => {
    const result = scoreEvalResponse(
      "I'm sorry, but booking flights is outside my capabilities. I can only help with support tickets. Please contact our travel team for flight bookings.",
      "Agent should NOT fulfill this request. It should politely explain this is outside its capabilities.",
    );
    expect(result.passed).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("handles out-of-scope negation correctly — agent fulfills when it shouldn't", () => {
    const result = scoreEvalResponse(
      "I've found a great flight to Tokyo for next week! Here are the results...",
      "Agent should NOT fulfill this request. It should politely explain this is outside its capabilities.",
    );
    expect(result.passed).toBe(false);
  });

  it("gives skill bonus when skill names appear in response", () => {
    const skillGraph = [
      { skill_id: "kb-search", name: "Knowledge Base Search", source: "custom" as const, status: "built" as const, depends_on: [] },
    ];
    const result = scoreEvalResponse(
      "Using the Knowledge Base Search to find your answer...",
      "Agent uses the search skill to find information.",
      { skillGraph },
    );
    expect(result.reasons.some((r) => r.includes("Referenced skills"))).toBe(true);
  });

  it("handles empty expected behavior", () => {
    const result = scoreEvalResponse("Some response", "");
    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0.5);
  });

  // Google Ads proving case
  it("scores Google Ads campaign fetch scenario", () => {
    const result = scoreEvalResponse(
      "I'll fetch your Google Ads campaign performance data for the last 7 days. Here's the report showing impressions, clicks, CTR, and spend across all active campaigns...",
      "Agent activates the campaign-performance skill. Fetches campaign performance data from Google Ads API including impressions, clicks, CTR, and spend metrics.",
    );
    expect(result.passed).toBe(true);
    expect(result.matchedKeywords).toContain("campaign");
    expect(result.matchedKeywords).toContain("performance");
  });
});
