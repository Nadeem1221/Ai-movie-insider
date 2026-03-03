import { analyzeSentiment } from "../src/lib/sentiment";

describe("analyzeSentiment", () => {
  it("returns mixed when no reviews", () => {
    const res = analyzeSentiment([]);
    expect(res.label).toBe("mixed");
    expect(res.score).toBe(0);
  });

  it("detects positive sentiment", () => {
    const res = analyzeSentiment([
      "Amazing movie, I loved every second!",
      "Great acting and fantastic visuals."
    ]);
    expect(res.label).toBe("positive");
    expect(res.score).toBeGreaterThan(0);
  });

  it("detects negative sentiment", () => {
    const res = analyzeSentiment([
      "This was the worst movie, boring and terrible.",
      "Awful pacing and bad script."
    ]);
    expect(res.label).toBe("negative");
    expect(res.score).toBeLessThan(0);
  });

  it("returns mixed for balanced reviews", () => {
    const res = analyzeSentiment([
      "Great visuals but the story was bad.",
      "Some amazing moments, but overall disappointing."
    ]);
    expect(res.label).toBe("mixed");
  });
});
