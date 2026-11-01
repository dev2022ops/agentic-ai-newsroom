# Agentic AI Newsroom

A Vite (vanilla JS) app that runs a small multi-agent content pipeline:

```
Research Agent ──► Human review (pick top 3) ──┬─► LinkedIn Agent  (3 posts)
                                               └─► X/Twitter Agent (3 threads)   ← run in parallel
```

1. **Research Agent**: searches recent AI news with **SerpAPI** (Google News, past day/week/month),
   then asks the LLM for **10 content ideas** with summary, angle, why-now and sources.
2. **Human review**: you select exactly **3** ideas. You can also send feedback and regenerate the 10 ideas.
3. **LinkedIn Agent** writes one post per idea for senior technical professionals (10–20 yrs) who are
   new to agentic AI. If you enter a **CTA link**, a CTA line and the link are added below every post.
   If you leave it empty, no CTA is added.
4. **X/Twitter Agent** writes one thread per idea for SF-area startup developers. You set the
   **number of tweets per thread** (2–15) for each idea. Tweets are checked against the 280-character
   limit, and the agent shortens any that run over.

The LinkedIn and X agents start at the same time once you approve. Each post or thread can be
regenerated on its own or copied.

## Setup

```bash
npm install
npm run dev
```

Open the URL Vite prints. **Settings** asks for:

- **OpenAI API key**
- **SerpAPI key**
- **Model**: defaults to `gpt-6.1-sol`, editable
- **News time range**

Keys are stored in `sessionStorage` (cleared when the tab closes) unless you tick
*Remember keys*, which uses `localStorage` instead.

## Why there is a proxy

SerpAPI blocks direct browser requests (CORS), so `vite.config.js` proxies
`/api/serpapi → serpapi.com` and `/api/openai → api.openai.com`. Your keys are sent with each
request and are never stored by the server. The proxy runs with both `npm run dev` and
`npm run preview`. For a static deploy (for example `dist/` on a CDN), you need an equivalent
proxy, such as a small serverless function, in front of the two APIs.

## Project layout

```
src/
  agents/research.js   Research Agent (SerpAPI + LLM → 10 ideas)
  agents/linkedin.js   LinkedIn Agent (audience prompt, CTA handling)
  agents/twitter.js    X/Twitter Agent (N tweets, 280-char enforcement, n/N numbering)
  lib/openai.js        Chat Completions client (JSON mode)
  lib/serp.js          SerpAPI news search client
  settings.js          Key/preference persistence
  main.js              UI + orchestration
```
