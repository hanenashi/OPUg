(function () {
  'use strict';

  const PREFIX = 'opug_';

  function gmGet(key, fallback) {
    if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function gmSet(key, value) {
    if (typeof GM_setValue === 'function') GM_setValue(key, value);
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (_) {}
  }

  function request(details) {
    if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest(details);
    if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') return GM.xmlHttpRequest(details);
    return null;
  }

  window.OPUg = window.OPUg || {};
  window.OPUg.config = {
    get: gmGet,
    set: gmSet,
    request,
    firebase: {
      get projectId() { return gmGet('firebase_project_id', ''); },
      get apiKey() { return gmGet('firebase_api_key', ''); },
      get ownerId() { return gmGet('owner_id', 'local'); }
    }
  };
})();

