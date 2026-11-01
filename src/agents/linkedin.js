import { chatJSON } from '../lib/openai.js';

const SYSTEM = `You are the LinkedIn Agent in an AI newsroom.
Audience: technical professionals with 10-20 years of experience (architects, engineering
managers, senior engineers, CTOs). They are technically sharp but may not know much about
agentic AI yet.

Writing rules:
- Approachable and clear: explain agentic-AI concepts with plain language and analogies drawn
  from things they already know (distributed systems, automation, workflows, APIs).
- No hype, no buzzword soup, no condescension. Respect their experience.
- Strong first 2 lines (the hook shown before "...see more").
- Short paragraphs, generous line breaks, optional short bullet list.
- 150-300 words. At most 3 relevant hashtags at the very end.
- Use emoji sparingly (0-3).
- Do NOT include any URLs in the post body.
Respond with JSON only.`;

export async function writeLinkedInPost({ settings, idea, ctaLink, notes, signal }) {
  const user = `Write one LinkedIn post for this idea.

Title: ${idea.title}
Summary: ${idea.summary}
Angle: ${idea.angle}
Why now: ${idea.whyNow}
${notes ? `Human notes: ${notes}\n` : ''}
${
  ctaLink
    ? `A call-to-action link will be placed directly below the post. Write a short CTA line
(max 15 words) that naturally invites readers to click it. Do not include the URL itself.`
    : 'No CTA link will be used, so set "cta" to an empty string.'
}

JSON shape:
{ "hook": "first line", "post": "full post text including the hook, without CTA", "cta": "cta line or empty string" }`;

  const json = await chatJSON({ apiKey: settings.openaiKey, model: settings.model, system: SYSTEM, user, signal });

  const post = (json.post || '').trim();
  const cta = (json.cta || '').trim();
  // The CTA + link is appended deterministically so the link is always exact.
  const full = ctaLink ? `${post}\n\n${cta ? `${cta}\n` : '👉 '}${ctaLink}` : post;
  return { ideaId: idea.id, title: idea.title, text: full };
}

/** LinkedIn Agent: one post for each selected idea (in parallel). */
export async function runLinkedInAgent({ settings, ideas, ctaLink, notes, onLog, signal }) {
  onLog?.(`Writing ${ideas.length} LinkedIn posts…`);
  const posts = await Promise.all(
    ideas.map((idea) => writeLinkedInPost({ settings, idea, ctaLink, notes, signal }))
  );
  onLog?.('LinkedIn posts ready.');
  return posts;
}
