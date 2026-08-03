import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync(new URL('../finallylylyly.html', import.meta.url), 'utf8');

export function loadApp(opts = {}) {
  const { seed, confirmValue = true } = opts;
  const errors = [];
  const alerts = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole: vc,
    beforeParse(window) {
      window.localStorage.clear();
      window.confirm = typeof confirmValue === 'function' ? confirmValue : () => confirmValue;
      window.alert = (m) => alerts.push(String(m));
      if (seed) seed(window);
    }
  });

  return { win: dom.window, dom, errors, alerts };
}

export function importJson(win, payload) {
  const input = win.document.getElementById('importFileInput');
  const file = new win.File([JSON.stringify(payload)], 'x.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new win.Event('change'));
}

export const flush = () => new Promise((r) => setTimeout(r, 60));

export function clickDialogOk(win) {
  win.document.getElementById('dialogOk').click();
}

export function clickDialogCancel(win) {
  win.document.getElementById('dialogCancel').click();
}

export function dialogText(win) {
  return win.document.getElementById('dialogMsg').textContent;
}

export function stubMatchMedia(win, initialDark) {
  const listeners = [];
  const mql = {
    matches: !!initialDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener(type, cb) { if (type === 'change') listeners.push(cb); },
    removeEventListener(type, cb) { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); },
    dispatchDark(v) {
      this.matches = !!v;
      listeners.forEach(cb => cb({ matches: this.matches }));
    }
  };
  Object.defineProperty(win, 'matchMedia', { configurable: true, value: () => mql });
  return mql;
}