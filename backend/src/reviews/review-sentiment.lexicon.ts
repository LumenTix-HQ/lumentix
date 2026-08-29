/**
 * Lexicon backing {@link ReviewSentimentService}.
 *
 * The analyser is deliberately dictionary-based rather than model-based: it
 * runs in-process with no network call, no model download and no per-review
 * cost, and — because it is pure data — its verdict on any given review is
 * reproducible and reviewable. Everything here is lowercase; the analyser
 * lowercases input before matching.
 */

/** Terms that carry sentiment, weighted by strength. */
export const SENTIMENT_LEXICON: Record<string, number> = {
  // strong positive
  amazing: 1, excellent: 1, outstanding: 1, fantastic: 1, incredible: 1,
  perfect: 1, superb: 1, flawless: 1, unforgettable: 1, phenomenal: 1,
  // moderate positive
  great: 0.7, wonderful: 0.7, brilliant: 0.7, lovely: 0.7, enjoyable: 0.7,
  smooth: 0.6, friendly: 0.6, helpful: 0.6, professional: 0.6, clean: 0.6,
  comfortable: 0.6, organised: 0.6, organized: 0.6, punctual: 0.6,
  // mild positive
  good: 0.5, nice: 0.5, solid: 0.5, decent: 0.4, fine: 0.3, okay: 0.2,
  worth: 0.4, recommend: 0.6, loved: 0.8, liked: 0.5, fun: 0.6,
  // mild negative
  bland: -0.4, average: -0.2, mediocre: -0.5, slow: -0.4, cramped: -0.5,
  crowded: -0.4, expensive: -0.5, overpriced: -0.7, late: -0.5, noisy: -0.4,
  confusing: -0.5, unclear: -0.4, dirty: -0.7, rude: -0.8, unhelpful: -0.6,
  disorganised: -0.7, disorganized: -0.7, delayed: -0.6, cancelled: -0.6,
  // strong negative
  terrible: -1, awful: -1, horrible: -1, appalling: -1, disgusting: -1,
  worst: -1, useless: -0.9, disappointing: -0.8, disappointed: -0.8,
  scam: -1, refund: -0.5, waste: -0.9, unacceptable: -0.9, chaos: -0.8,
};

/** Words that scale the sentiment of the term that follows them. */
export const INTENSIFIERS: Record<string, number> = {
  very: 1.5, really: 1.5, extremely: 2, incredibly: 2, absolutely: 2,
  totally: 1.5, so: 1.3, quite: 1.2, fairly: 0.8, somewhat: 0.6,
  slightly: 0.5, barely: 0.4, 'kind of': 0.6,
};

/** Words that invert the sentiment of the term that follows them. */
export const NEGATORS = [
  'not', 'never', 'no', "wasn't", 'wasnt', "isn't", 'isnt', "didn't",
  'didnt', "couldn't", 'couldnt', "wouldn't", 'wouldnt', 'nothing',
  'hardly', 'without',
];

/**
 * Themes reviewers actually comment on, and the words that signal each.
 *
 * Used to turn a pile of free text into "what people keep praising" and
 * "what people keep complaining about" rather than one undifferentiated
 * score.
 */
export const THEME_KEYWORDS: Record<string, string[]> = {
  venue: ['venue', 'hall', 'room', 'space', 'seating', 'seat', 'stage', 'view'],
  sound: ['sound', 'audio', 'acoustics', 'music', 'volume', 'mic', 'speakers'],
  staff: ['staff', 'crew', 'team', 'security', 'host', 'organiser', 'organizer'],
  pricing: ['price', 'pricing', 'ticket', 'cost', 'value', 'fee', 'expensive'],
  organisation: ['queue', 'line', 'schedule', 'timing', 'entry', 'checkin', 'check-in', 'registration'],
  food: ['food', 'drink', 'bar', 'catering', 'snack', 'meal', 'coffee'],
  accessibility: ['access', 'accessible', 'wheelchair', 'ramp', 'parking', 'transport'],
};

/**
 * Terms that make a review a moderation problem rather than a negative
 * opinion. A one-star review is not toxic; abuse aimed at a person is.
 *
 * Slurs are deliberately not enumerated here — this list covers the generic
 * abuse and threat patterns that show up in event feedback, and moderation
 * escalation is the backstop for the rest.
 */
export const TOXIC_TERMS: Record<string, number> = {
  idiot: 0.7, idiots: 0.7, moron: 0.7, morons: 0.7, stupid: 0.5,
  incompetent: 0.4, clown: 0.5, clowns: 0.5, trash: 0.4, garbage: 0.4,
  liar: 0.6, liars: 0.6, thief: 0.8, thieves: 0.8, crook: 0.7,
  'shut up': 0.6, 'kill yourself': 1, 'go die': 1, 'i will find you': 1,
  'watch your back': 0.9, 'you people': 0.5, 'deserve to fail': 0.6,
};
