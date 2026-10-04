// Theme (spec S19, S37): System follows prefers-color-scheme, Light and Dark override it. The choice is kept in
// localStorage, shared by the review page and the document list; storage may throw, and the page then stays in System.
export function stored(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export function store(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    // private mode or blocked storage: the choice lasts until reload
  }
}

export function setTheme(t, save = true) {
  if (!['system', 'light', 'dark'].includes(t)) t = 'system';
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  if (save) store('iar.theme', t);
  for (const b of document.querySelectorAll('#themeSeg button')) b.classList.toggle('on', b.dataset.t === t);
}

// Wires the System / Light / Dark switch (#themeSeg) and applies the stored choice.
export function themeSwitch() {
  setTheme(stored('iar.theme') || 'system', false);
  document.getElementById('themeSeg').addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (t && t.dataset.t) setTheme(t.dataset.t);
  });
}
