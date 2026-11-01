import './style.css';
import { loadSettings, saveSettings, clearKeys } from './settings.js';
import { runResearchAgent } from './agents/research.js';
import { runLinkedInAgent, writeLinkedInPost } from './agents/linkedin.js';
import { runTwitterAgent, writeThread, TWEET_LIMIT } from './agents/twitter.js';

const MAX_SELECTED = 3;
const DEFAULT_TWEETS = 5;
const MIN_TWEETS = 2;
const MAX_TWEETS = 15;

const state = {
  settings: loadSettings(),
  step: 1,
  focus: '',
  research: { status: 'idle', log: [], error: null, ideas: [], articleCount: 0 },
  selected: [], // idea ids, in selection order
  feedback: '',
  notes: '',
  ctaLink: '',
  tweetCounts: {}, // ideaId -> number
  linkedin: { status: 'idle', error: null, posts: [] },
  twitter: { status: 'idle', error: null, threads: [] },
};

let controller = null;
const app = document.getElementById('app');

// ---------- helpers ----------

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const safeUrl = (u) => {
  try {
    const url = new URL(u);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
};

function isValidLink(v) {
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const selectedIdeas = () =>
  state.selected.map((id) => state.research.ideas.find((i) => i.id === id)).filter(Boolean);

function hasKeys() {
  return Boolean(state.settings.openaiKey && state.settings.serpKey);
}

function setStep(step) {
  state.step = step;
  render();
}

async function copy(text, btn) {
  await navigator.clipboard.writeText(text);
  const old = btn.textContent;
  btn.textContent = 'Copied ✓';
  setTimeout(() => (btn.textContent = old), 1200);
}

// ---------- actions ----------

async function startResearch({ withFeedback = false } = {}) {
  if (!hasKeys()) return openSettings();
  controller?.abort();
  controller = new AbortController();

  state.research = { status: 'running', log: [], error: null, ideas: [], articleCount: 0 };
  state.selected = [];
  state.step = 1;
  render();

  const onLog = (msg) => {
    state.research.log.push(msg);
    render();
  };

  try {
    const { ideas, articleCount } = await runResearchAgent({
      settings: state.settings,
      focus: state.focus,
      feedback: withFeedback ? state.feedback : '',
      onLog,
      signal: controller.signal,
    });
    state.research = { ...state.research, status: 'done', ideas, articleCount };
    state.step = 2;
  } catch (err) {
    if (err.name === 'AbortError') return;
    state.research.status = 'error';
    state.research.error = err.message;
  }
  render();
}

async function approveAndGenerate() {
  const ideas = selectedIdeas();
  if (ideas.length !== MAX_SELECTED) return;
  if (!isValidLink(state.ctaLink.trim())) return;

  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;

  for (const idea of ideas) state.tweetCounts[idea.id] ??= DEFAULT_TWEETS;

  state.linkedin = { status: 'running', error: null, posts: [] };
  state.twitter = { status: 'running', error: null, threads: [] };
  state.step = 3;
  render();

  const common = { settings: state.settings, ideas, notes: state.notes.trim(), signal };

  // Both agents run simultaneously; one failing does not block the other.
  const li = runLinkedInAgent({ ...common, ctaLink: state.ctaLink.trim() })
    .then((posts) => (state.linkedin = { status: 'done', error: null, posts }))
    .catch((err) => {
      if (err.name !== 'AbortError') state.linkedin = { status: 'error', error: err.message, posts: [] };
    })
    .finally(render);

  const tw = runTwitterAgent({ ...common, counts: state.tweetCounts })
    .then((threads) => (state.twitter = { status: 'done', error: null, threads }))
    .catch((err) => {
      if (err.name !== 'AbortError') state.twitter = { status: 'error', error: err.message, threads: [] };
    })
    .finally(render);

  await Promise.all([li, tw]);
}

async function regenerateOne(kind, ideaId, btn) {
  const idea = state.research.ideas.find((i) => i.id === ideaId);
  if (!idea) return;
  btn.disabled = true;
  btn.textContent = 'Regenerating…';
  const base = { settings: state.settings, idea, notes: state.notes.trim() };
  try {
    if (kind === 'linkedin') {
      const post = await writeLinkedInPost({ ...base, ctaLink: state.ctaLink.trim() });
      state.linkedin.posts = state.linkedin.posts.map((p) => (p.ideaId === ideaId ? post : p));
    } else {
      const thread = await writeThread({ ...base, count: state.tweetCounts[ideaId] });
      state.twitter.threads = state.twitter.threads.map((t) => (t.ideaId === ideaId ? thread : t));
    }
  } catch (err) {
    alert(err.message);
  }
  render();
}

// ---------- settings dialog ----------

const dialog = document.getElementById('settings-dialog');
const form = document.getElementById('settings-form');

function openSettings() {
  const s = state.settings;
  form.openaiKey.value = s.openaiKey;
  form.serpKey.value = s.serpKey;
  form.model.value = s.model;
  form.recency.value = s.recency;
  form.remember.checked = s.remember;
  dialog.showModal();
}

document.getElementById('open-settings').addEventListener('click', openSettings);

form.addEventListener('submit', () => {
  state.settings = saveSettings({
    openaiKey: form.openaiKey.value.trim(),
    serpKey: form.serpKey.value.trim(),
    model: form.model.value.trim() || 'gpt-6.1-sol',
    recency: form.recency.value,
    remember: form.remember.checked,
  });
  render();
});

document.getElementById('clear-keys').addEventListener('click', () => {
  state.settings = clearKeys(state.settings);
  form.openaiKey.value = '';
  form.serpKey.value = '';
  render();
});

// ---------- rendering ----------

function renderHeader() {
  const pill = document.getElementById('key-status');
  pill.textContent = hasKeys() ? 'keys set' : 'keys needed';
  pill.className = `pill ${hasKeys() ? 'ok' : 'warn'}`;

  document.querySelectorAll('#stepper li').forEach((li) => {
    const n = Number(li.dataset.step);
    li.className = n === state.step ? 'active' : n < state.step ? 'done' : '';
  });
}

function renderResearch() {
  const r = state.research;
  const running = r.status === 'running';
  return `
  <section class="card">
    <div class="agent-head">
      <h2>🔎 Research Agent</h2>
      ${statusBadge(r.status)}
    </div>
    <p class="muted">Searches the latest AI news with SerpAPI and proposes 10 content ideas using <code>${esc(
      state.settings.model
    )}</code>.</p>
    ${hasKeys() ? '' : `<div class="notice">Add your OpenAI and SerpAPI keys in <a href="#" data-action="settings">Settings</a> to get started.</div>`}
    <div class="row">
      <input id="focus" type="text" placeholder="Optional focus, e.g. 'coding agents', 'MCP', 'enterprise adoption'" value="${esc(
        state.focus
      )}" ${running ? 'disabled' : ''}/>
      <button class="btn primary" data-action="research" ${running ? 'disabled' : ''}>
        ${running ? 'Researching…' : r.ideas.length ? 'Run fresh research' : 'Run research'}
      </button>
    </div>
    ${r.log.length ? `<ul class="log">${r.log.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    ${r.error ? `<div class="error">${esc(r.error)}</div>` : ''}
  </section>`;
}

function renderIdeas() {
  const r = state.research;
  if (!r.ideas.length) return '';
  const count = state.selected.length;
  const canApprove = count === MAX_SELECTED && isValidLink(state.ctaLink.trim());
  const linkInvalid = !isValidLink(state.ctaLink.trim());

  return `
  <section class="card">
    <div class="agent-head">
      <h2>🧑‍⚖️ Human review: pick your top 3</h2>
      <span class="pill ${count === MAX_SELECTED ? 'ok' : ''}">${count}/${MAX_SELECTED} selected</span>
    </div>
    <p class="muted">${r.ideas.length} ideas from ${r.articleCount} recent articles. Select exactly three to send to the writing agents.</p>

    <div class="ideas">
      ${r.ideas
        .map((idea, idx) => {
          const sel = state.selected.includes(idea.id);
          const rank = state.selected.indexOf(idea.id) + 1;
          const disabled = !sel && count >= MAX_SELECTED;
          return `
        <label class="idea ${sel ? 'selected' : ''} ${disabled ? 'disabled' : ''}">
          <input type="checkbox" data-idea="${idea.id}" ${sel ? 'checked' : ''} ${disabled ? 'disabled' : ''}/>
          <div class="idea-body">
            <div class="idea-title"><span class="num">${sel ? `#${rank}` : idx + 1}</span> ${esc(idea.title)}</div>
            <p>${esc(idea.summary)}</p>
            <p><strong>Angle:</strong> ${esc(idea.angle)}</p>
            ${idea.whyNow ? `<p><strong>Why now:</strong> ${esc(idea.whyNow)}</p>` : ''}
            ${idea.audienceFit ? `<p class="muted small"><strong>Fit:</strong> ${esc(idea.audienceFit)}</p>` : ''}
            ${
              idea.sources?.length
                ? `<div class="sources">${idea.sources
                    .map((s) => `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>`)
                    .join('')}</div>`
                : ''
            }
          </div>
        </label>`;
        })
        .join('')}
    </div>

    <details class="feedback">
      <summary>Not happy with these? Give feedback and regenerate</summary>
      <textarea id="feedback" rows="3" placeholder="e.g. Fewer funding stories, more hands-on developer tooling">${esc(
        state.feedback
      )}</textarea>
      <button class="btn ghost" data-action="regen-ideas">Regenerate 10 ideas with feedback</button>
    </details>

    <h3>Content options</h3>
    <div class="grid2">
      <label>LinkedIn CTA link <span class="muted">(optional, added below every post)</span>
        <input id="cta-link" type="text" inputmode="url" placeholder="https://your-newsletter.com" value="${esc(state.ctaLink)}" class="${
          linkInvalid ? 'invalid' : ''
        }"/>
        ${linkInvalid ? '<span class="error small">Enter a full http(s) URL, or leave empty.</span>' : ''}
      </label>
      <label>Notes for both writers <span class="muted">(optional)</span>
        <input id="notes" type="text" placeholder="e.g. mention our upcoming webinar, keep it optimistic" value="${esc(
          state.notes
        )}"/>
      </label>
    </div>

    ${
      count
        ? `<div class="tweet-counts">
        <span class="muted">Tweets per X thread:</span>
        ${selectedIdeas()
          .map(
            (idea) => `
          <label class="count">
            <span title="${esc(idea.title)}">#${state.selected.indexOf(idea.id) + 1} ${esc(truncate(idea.title, 40))}</span>
            <input type="number" min="${MIN_TWEETS}" max="${MAX_TWEETS}" data-count="${idea.id}" value="${
              state.tweetCounts[idea.id] ?? DEFAULT_TWEETS
            }"/>
          </label>`
          )
          .join('')}
      </div>`
        : ''
    }

    <div class="row end">
      <button class="btn primary" data-action="approve" ${canApprove ? '' : 'disabled'}>
        Approve &amp; run LinkedIn + X agents →
      </button>
    </div>
  </section>`;
}

function renderOutputs() {
  if (state.step < 3) return '';
  return `
  <section class="outputs">
    <div class="card">
      <div class="agent-head">
        <h2>💼 LinkedIn Agent</h2>
        ${statusBadge(state.linkedin.status)}
      </div>
      <p class="muted small">Audience: senior technical pros, new to agentic AI.${
        state.ctaLink ? ` CTA → ${esc(state.ctaLink)}` : ' No CTA link.'
      }</p>
      ${state.linkedin.error ? `<div class="error">${esc(state.linkedin.error)}</div>` : ''}
      ${state.linkedin.status === 'running' ? skeleton(3) : ''}
      ${state.linkedin.posts
        .map(
          (p) => `
        <article class="output">
          <h4>${esc(p.title)}</h4>
          <pre class="post">${linkify(esc(p.text))}</pre>
          <div class="row between">
            <span class="muted small">${p.text.length} chars</span>
            <div class="row">
              <button class="btn ghost sm" data-regen="linkedin" data-id="${p.ideaId}">Regenerate</button>
              <button class="btn sm" data-copy-li="${p.ideaId}">Copy</button>
            </div>
          </div>
        </article>`
        )
        .join('')}
    </div>

    <div class="card">
      <div class="agent-head">
        <h2>𝕏 Twitter Agent</h2>
        ${statusBadge(state.twitter.status)}
      </div>
      <p class="muted small">Audience: SF startup developers.</p>
      ${state.twitter.error ? `<div class="error">${esc(state.twitter.error)}</div>` : ''}
      ${state.twitter.status === 'running' ? skeleton(3) : ''}
      ${state.twitter.threads
        .map(
          (t) => `
        <article class="output">
          <h4>${esc(t.title)}</h4>
          <ol class="thread">
            ${t.tweets
              .map(
                (tw) => `<li class="tweet"><p>${linkify(esc(tw))}</p><span class="small ${
                  tw.length > TWEET_LIMIT ? 'error' : 'muted'
                }">${tw.length}/${TWEET_LIMIT}</span></li>`
              )
              .join('')}
          </ol>
          <div class="row between">
            <label class="count small">Tweets
              <input type="number" min="${MIN_TWEETS}" max="${MAX_TWEETS}" data-count="${t.ideaId}" value="${
                state.tweetCounts[t.ideaId]
              }"/>
            </label>
            <div class="row">
              <button class="btn ghost sm" data-regen="twitter" data-id="${t.ideaId}">Regenerate</button>
              <button class="btn sm" data-copy-tw="${t.ideaId}">Copy thread</button>
            </div>
          </div>
        </article>`
        )
        .join('')}
    </div>
  </section>
  ${
    state.linkedin.status !== 'running' && state.twitter.status !== 'running'
      ? `<div class="row end"><button class="btn ghost" data-action="back">← Back to idea selection</button></div>`
      : ''
  }`;
}

const truncate = (s = '', n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const linkify = (html) => html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const skeleton = (n) => Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');

function statusBadge(status) {
  const map = { idle: ['Idle', ''], running: ['Running', 'run'], done: ['Done', 'ok'], error: ['Error', 'err'] };
  const [label, cls] = map[status] || map.idle;
  return `<span class="pill ${cls}">${status === 'running' ? '<span class="spinner"></span>' : ''}${label}</span>`;
}

function render() {
  renderHeader();
  // Preserve focus/caret for text inputs across re-renders.
  const active = document.activeElement;
  const activeId = active?.id;
  const caret = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;

  app.innerHTML = renderResearch() + (state.step >= 2 ? renderIdeas() : '') + renderOutputs();

  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) {
      el.focus();
      if (caret && el.setSelectionRange && el.type !== 'number') {
        try {
          el.setSelectionRange(...caret);
        } catch {}
      }
    }
  }
}

// ---------- events (delegated) ----------

app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action], [data-regen], [data-copy-li], [data-copy-tw]');
  if (!t) return;
  const action = t.dataset.action;
  if (action) e.preventDefault();

  if (action === 'settings') openSettings();
  else if (action === 'research') startResearch();
  else if (action === 'regen-ideas') startResearch({ withFeedback: true });
  else if (action === 'approve') approveAndGenerate();
  else if (action === 'back') setStep(2);
  else if (t.dataset.regen) regenerateOne(t.dataset.regen, t.dataset.id, t);
  else if (t.dataset.copyLi) {
    const p = state.linkedin.posts.find((x) => x.ideaId === t.dataset.copyLi);
    if (p) copy(p.text, t);
  } else if (t.dataset.copyTw) {
    const th = state.twitter.threads.find((x) => x.ideaId === t.dataset.copyTw);
    if (th) copy(th.tweets.join('\n\n---\n\n'), t);
  }
});

app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.idea) {
    const id = t.dataset.idea;
    if (t.checked && state.selected.length < MAX_SELECTED) state.selected.push(id);
    else state.selected = state.selected.filter((x) => x !== id);
    render();
  } else if (t.dataset.count) {
    const n = Math.max(MIN_TWEETS, Math.min(MAX_TWEETS, parseInt(t.value, 10) || DEFAULT_TWEETS));
    state.tweetCounts[t.dataset.count] = n;
    render();
  }
});

app.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'focus') state.focus = t.value;
  else if (t.id === 'feedback') state.feedback = t.value;
  else if (t.id === 'notes') state.notes = t.value;
  else if (t.id === 'cta-link') {
    state.ctaLink = t.value;
    render(); // refresh validation + approve button
  }
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'focus' && state.research.status !== 'running') startResearch();
});

render();
if (!hasKeys()) openSettings();
