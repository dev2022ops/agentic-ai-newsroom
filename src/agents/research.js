import { searchNews } from '../lib/serp.js';
import { chatJSON } from '../lib/openai.js';

const BASE_QUERIES = [
  'agentic AI',
  'AI agents launch',
  'LLM model release',
  'OpenAI OR Anthropic OR Google DeepMind announcement',
  'AI developer tools',
  'AI startup funding',
];

/**
 * Research Agent: searches for the latest AI news and proposes 10 content ideas.
 */
export async function runResearchAgent({ settings, focus, feedback, onLog, signal }) {
  const queries = focus?.trim()
    ? [focus.trim(), ...BASE_QUERIES.slice(0, 4).map((q) => `${q} ${focus.trim()}`)]
    : BASE_QUERIES;

  onLog?.(`Searching ${queries.length} news queries via SerpAPI…`);

  const results = await Promise.allSettled(
    queries.map((query) =>
      searchNews({ apiKey: settings.serpKey, query, recency: settings.recency, signal })
    )
  );

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length === results.length) throw failures[0].reason;
  if (failures.length) onLog?.(`${failures.length} search(es) failed; continuing with the rest.`);

  // Merge + dedupe by URL.
  const seen = new Set();
  const articles = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const a of r.value) {
      if (!a.link || seen.has(a.link)) continue;
      seen.add(a.link);
      articles.push(a);
    }
  }
  if (!articles.length) throw new Error('No news articles found. Try a different focus or time range.');

  onLog?.(`Found ${articles.length} unique articles. Asking ${settings.model} for 10 ideas…`);

  const digest = articles
    .slice(0, 60)
    .map(
      (a, i) =>
        `[${i + 1}] ${a.title}\nSource: ${a.source || 'unknown'} | ${a.date || ''}\nURL: ${a.link}\n${a.snippet || ''}`
    )
    .join('\n\n');

  const system = `You are the Research Agent in an AI newsroom. You read the latest AI news and
propose content ideas for a creator who writes for two audiences:
- LinkedIn: senior technical professionals (10-20 years experience) who are newer to agentic AI.
- X/Twitter: developers at San Francisco Bay Area tech startups.
Pick stories that are genuinely new, substantive, and have a clear "why this matters" angle.
Avoid duplicates; each idea must be distinct. Ground every idea in the provided articles only.
Respond with JSON only.`;

  const user = `Today's date: ${new Date().toDateString()}
${focus?.trim() ? `Focus area requested by the human: ${focus.trim()}\n` : ''}${
    feedback?.trim() ? `Feedback from the human on the previous batch of ideas: ${feedback.trim()}\n` : ''
  }
News articles:
${digest}

Return exactly 10 ideas in this JSON shape:
{
  "ideas": [
    {
      "title": "short punchy working title",
      "summary": "2-3 sentence summary of the news",
      "angle": "the specific take / hook for the content",
      "whyNow": "one sentence on why this is timely",
      "audienceFit": "which audience it suits best and why (LinkedIn, X, or both)",
      "sources": [{ "title": "article title", "url": "article url" }]
    }
  ]
}`;

  const json = await chatJSON({
    apiKey: settings.openaiKey,
    model: settings.model,
    system,
    user,
    signal,
  });

  const ideas = (json.ideas || []).slice(0, 10).map((idea, i) => ({ id: `idea-${i + 1}`, ...idea }));
  if (!ideas.length) throw new Error('The model returned no ideas.');
  onLog?.(`Research complete: ${ideas.length} ideas ready for review.`);
  return { ideas, articleCount: articles.length };
}
