export type SentimentLabel = "positive" | "negative" | "mixed";

export interface SentimentResult {
  label: SentimentLabel;
  score: number; // -1..1
  summary: string;
}

/**
 * Extremely lightweight heuristic sentiment analysis for short movie reviews.
 * This is intentionally simple and transparent for the assignment.
 */
const positiveWords = [
  "amazing",
  "awesome",
  "great",
  "good",
  "fantastic",
  "incredible",
  "masterpiece",
  "love",
  "loved",
  "excellent",
  "brilliant",
  "beautiful",
  "best",
  "enjoyed",
  "wonderful"
];

const negativeWords = [
  "bad",
  "awful",
  "terrible",
  "worst",
  "boring",
  "waste",
  "disappointing",
  "disappointed",
  "poor",
  "weak",
  "mess",
  "hate",
  "hated",
  "cringe",
  "flat"
];

export function analyzeSentiment(reviews: string[]): SentimentResult {
  if (!reviews.length) {
    return {
      label: "mixed",
      score: 0,
      summary: "Not enough audience reviews were found to determine sentiment."
    };
  }

  let pos = 0;
  let neg = 0;

  for (const raw of reviews) {
    const text = raw.toLowerCase();
    for (const w of positiveWords) {
      if (text.includes(w)) pos += 1;
    }
    for (const w of negativeWords) {
      if (text.includes(w)) neg += 1;
    }
  }

  const total = pos + neg || 1;
  const score = (pos - neg) / total;

  let label: SentimentLabel = "mixed";
  if (score > 0.2) label = "positive";
  else if (score < -0.2) label = "negative";

  let summary: string;
  if (label === "positive") {
    summary =
      "Audience sentiment skews positive, with many viewers praising the overall experience and key aspects of the film.";
  } else if (label === "negative") {
    summary =
      "Audience sentiment leans negative, with recurring complaints about pacing, storytelling, or overall engagement.";
  } else {
    summary =
      "Audience sentiment appears mixed, combining strong praise from some viewers with notable criticism from others.";
  }

  return { label, score: Number(score.toFixed(2)), summary };
}
