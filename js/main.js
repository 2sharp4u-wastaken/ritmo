// Boot: storage, offline support, first screen.
import * as store from './store.js';
import { route } from './screens.js';
import { audio } from './audio.js';

// test hook (only with ?test in the URL)
if (new URLSearchParams(location.search).has('test')) window.__ritmo = { audio };

store.load();
route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
