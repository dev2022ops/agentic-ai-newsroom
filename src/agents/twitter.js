import { chatJSON } from '../lib/openai.js';

export const TWEET_LIMIT = 280;

const SYSTEM = `You are the X/Twitter Agent in an AI newsroom.
Audience: developers working at tech startups in and around San Francisco. They are
builders, ship fast, live in their terminal, and are allergic to fluff and corporate tone.

Writing rules:
- Tweet 1 is the hook: specific, opinionated, makes them want to read the thread.
- Concrete over abstract: name the model/tool/API, give numbers, code-level implications,
  "here's what this means for what you're building".
- Casual, crisp, dev-native voice. No hashtags spam (0-1 max per thread), minimal emoji.
- Every tweet MUST be ${TWEET_LIMIT} characters or fewer.
- Do not number tweets yourself ("1/", "2/") — numbering is added automatically.
- The last tweet should wrap up with a takeaway or question to drive replies.
Respond with JSON only.`;

const NUMBER_RESERVE = 6; // room for " 10/10"

async function generateThread({ settings, idea, count, notes, signal }) {
  const user = `Write a Twitter/X thread of EXACTLY ${count} tweets for this idea.

Title: ${idea.title}
Summary: ${idea.summary}
Angle: ${idea.angle}
Why now: ${idea.whyNow}
Sources: ${(idea.sources || []).map((s) => s.url).join(', ')}
${notes ? `Human notes: ${notes}\n` : ''}
Each tweet must be at most ${TWEET_LIMIT - NUMBER_RESERVE} characters (a "n/N" counter will be appended).

JSON shape: { "tweets": ["tweet 1", "tweet 2", ...] }`;

  const json = await chatJSON({ apiKey: settings.openaiKey, model: settings.model, system: SYSTEM, user, signal });
  return (json.tweets || []).map((t) => String(t).trim()).filter(Boolean);
}

async function shortenTweets({ settings, tweets, signal }) {
  const max = TWEET_LIMIT - NUMBER_RESERVE;
  const user = `Some tweets in this thread are over ${max} characters. Rewrite ONLY the ones that are too
long so every tweet is at most ${max} characters. Keep meaning, voice, and order. Return the
same number of tweets.

${JSON.stringify({ tweets })}

JSON shape: { "tweets": [...] }`;
  const json = await chatJSON({ apiKey: settings.openaiKey, model: settings.model, system: SYSTEM, user, signal });
  const out = (json.tweets || []).map((t) => String(t).trim());
  return out.length === tweets.length ? out : tweets;
}

export function numberTweets(tweets) {
  const n = tweets.length;
  return n > 1 ? tweets.map((t, i) => `${t} ${i + 1}/${n}`) : tweets;
}

export async function writeThread({ settings, idea, count, notes, signal }) {
  let tweets = await generateThread({ settings, idea, count, notes, signal });
  if (tweets.some((t) => t.length > TWEET_LIMIT - NUMBER_RESERVE)) {
    tweets = await shortenTweets({ settings, tweets, signal });
  }
  return { ideaId: idea.id, title: idea.title, count, tweets: numberTweets(tweets) };
}

/** X/Twitter Agent: one thread per selected idea (in parallel). counts: { [ideaId]: n } */
export async function runTwitterAgent({ settings, ideas, counts, notes, onLog, signal }) {
  onLog?.(`Writing ${ideas.length} X/Twitter threads…`);
  const threads = await Promise.all(
    ideas.map((idea) => writeThread({ settings, idea, count: counts[idea.id], notes, signal }))
  );
  onLog?.('X/Twitter threads ready.');
  return threads;
}
