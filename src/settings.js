// Settings persistence. Non-secret preferences live in localStorage.
// API keys live in sessionStorage (cleared when the tab closes) unless the user
// opts in to "Remember keys", in which case they go to localStorage.

const PREFS = 'newsroom.prefs';
const KEYS = 'newsroom.keys';

const DEFAULTS = {
  openaiKey: '',
  serpKey: '',
  model: 'gpt-6.1-sol',
  recency: 'qdr:w',
  remember: false,
};

const read = (store, key) => {
  try {
    return JSON.parse(store.getItem(key) || '{}');
  } catch {
    return {};
  }
};

export function loadSettings() {
  const prefs = read(localStorage, PREFS);
  const keys = prefs.remember ? read(localStorage, KEYS) : read(sessionStorage, KEYS);
  return { ...DEFAULTS, ...prefs, ...keys };
}

export function saveSettings(s) {
  const { openaiKey, serpKey, ...prefs } = s;
  localStorage.setItem(PREFS, JSON.stringify(prefs));
  const keys = JSON.stringify({ openaiKey, serpKey });
  if (s.remember) {
    localStorage.setItem(KEYS, keys);
    sessionStorage.removeItem(KEYS);
  } else {
    sessionStorage.setItem(KEYS, keys);
    localStorage.removeItem(KEYS);
  }
  return { ...s };
}

export function clearKeys(s) {
  localStorage.removeItem(KEYS);
  sessionStorage.removeItem(KEYS);
  return { ...s, openaiKey: '', serpKey: '' };
}
