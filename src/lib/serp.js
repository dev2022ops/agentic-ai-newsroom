// SerpAPI client (routed through the Vite proxy because SerpAPI blocks CORS).

export async function searchNews({ apiKey, query, recency = 'qdr:w', num = 10, signal }) {
  if (!apiKey) throw new Error('SerpAPI key is missing. Add it in Settings.');

  const params = new URLSearchParams({
    engine: 'google',
    tbm: 'nws',
    q: query,
    tbs: recency,
    num: String(num),
    hl: 'en',
    gl: 'us',
    api_key: apiKey,
  });

  const res = await fetch(`/api/serpapi/search.json?${params}`, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(`SerpAPI error: ${body.error || `${res.status} ${res.statusText}`}`);
  }

  return (body.news_results || []).map((r) => ({
    title: r.title,
    link: r.link,
    source: typeof r.source === 'string' ? r.source : r.source?.name,
    date: r.date,
    snippet: r.snippet,
  }));
}
