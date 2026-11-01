// Minimal OpenAI Chat Completions client (routed through the Vite proxy).

export async function chatJSON({ apiKey, model, system, user, signal }) {
  if (!apiKey) throw new Error('OpenAI API key is missing. Add it in Settings.');

  const res = await fetch('/api/openai/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || `${res.status} ${res.statusText}`;
    throw new Error(`OpenAI error: ${msg}`);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned an empty response.');

  try {
    return JSON.parse(content);
  } catch {
    // Some models wrap JSON in prose or code fences; pull out the first object.
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Model did not return valid JSON.');
  }
}
