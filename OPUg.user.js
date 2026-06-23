// ==UserScript==
// @name         OPUg
// @namespace    https://github.com/hanenashi/OPUg
// @version      0.1.0-dev
// @description  Firebase-backed tags and custom galleries for opu.peklo.biz uploads.
// @author       hanenashi
// @match        https://opu.peklo.biz/
// @match        https://opu.peklo.biz/?page=userpanel*
// @match        https://opu.peklo.biz/?page=settings*
// @run-at       document-end
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      firestore.googleapis.com
// @connect      identitytoolkit.googleapis.com
// ==/UserScript==

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



(function () {
  'use strict';

  function normalizeTag(tag) {
    return String(tag || '').trim().toLowerCase().replace(/\s+/g, '-');
  }

  function parseTags(value) {
    return Array.from(
      new Set(
        String(value || '')
          .split(/[,\s]+/)
          .map(normalizeTag)
          .filter(Boolean)
      )
    );
  }

  function isConfigured() {
    return Boolean(window.OPUg.config.firebase.projectId);
  }

  function docIdForUrl(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
    }
    return 'u_' + Math.abs(hash).toString(36);
  }

  function firestoreBase() {
    const projectId = window.OPUg.config.firebase.projectId;
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
  }

  function toFirestoreFields(record) {
    return {
      url: { stringValue: record.url },
      thumbUrl: { stringValue: record.thumbUrl || record.url },
      title: { stringValue: record.title || '' },
      owner: { stringValue: record.owner || window.OPUg.config.firebase.ownerId },
      source: { stringValue: 'opu' },
      tagsNorm: { arrayValue: { values: record.tagsNorm.map((tag) => ({ stringValue: tag })) } },
      updatedAtMs: { integerValue: String(Date.now()) },
      createdAtMs: { integerValue: String(record.createdAtMs || Date.now()) }
    };
  }

  function fromFirestoreDocument(doc) {
    const fields = doc.fields || {};
    const tags = (((fields.tagsNorm || {}).arrayValue || {}).values || []).map((item) => item.stringValue).filter(Boolean);
    return {
      id: (doc.name || '').split('/').pop(),
      url: fields.url?.stringValue || '',
      thumbUrl: fields.thumbUrl?.stringValue || fields.url?.stringValue || '',
      title: fields.title?.stringValue || '',
      owner: fields.owner?.stringValue || '',
      tagsNorm: tags
    };
  }

  function firestoreRequest(method, path, body) {
    return new Promise((resolve, reject) => {
      if (!isConfigured()) {
        reject(new Error('Firebase project id is not configured.'));
        return;
      }
      const req = window.OPUg.config.request({
        method,
        url: firestoreBase() + path,
        headers: { 'Content-Type': 'application/json' },
        data: body ? JSON.stringify(body) : undefined,
        onload: (response) => {
          if (response.status >= 200 && response.status < 300) {
            resolve(response.responseText ? JSON.parse(response.responseText) : {});
          } else {
            reject(new Error(`Firestore HTTP ${response.status}`));
          }
        },
        onerror: () => reject(new Error('Firestore request failed.'))
      });
      if (!req) reject(new Error('Userscript request API is unavailable.'));
    });
  }

  async function saveUpload(record) {
    const tagsNorm = parseTags(record.tags || record.tagsNorm || '');
    if (!record.url || tagsNorm.length === 0) return null;
    const id = docIdForUrl(record.url);
    const body = { fields: toFirestoreFields({ ...record, tagsNorm }) };
    await firestoreRequest('PATCH', `/uploads/${id}`, body);
    return { ...record, id, tagsNorm };
  }

  async function searchByTags(rawTags) {
    const tags = parseTags(rawTags);
    if (tags.length === 0) return [];

    const body = {
      structuredQuery: {
        from: [{ collectionId: 'uploads' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'tagsNorm' },
            op: 'ARRAY_CONTAINS',
            value: { stringValue: tags[0] }
          }
        },
        limit: 100
      }
    };

    const response = await firestoreRequest('POST', ':runQuery', body);
    return response
      .map((row) => row.document && fromFirestoreDocument(row.document))
      .filter(Boolean)
      .filter((record) => tags.every((tag) => record.tagsNorm.includes(tag)));
  }

  window.OPUg.firebase = {
    isConfigured,
    normalizeTag,
    parseTags,
    saveUpload,
    searchByTags
  };
})();



(function () {
  'use strict';

  function isUserPanel() {
    return window.location.search.includes('page=userpanel');
  }

  function isSettingsPage() {
    return window.location.search.includes('page=settings');
  }

  function isUploadPage() {
    return window.location.origin === 'https://opu.peklo.biz' && window.location.pathname === '/' && !window.location.search;
  }

  function getThumbUrl(imageUrl) {
    try {
      const url = new URL(imageUrl);
      const parts = url.pathname.split('/');
      const fileName = parts.pop();
      if (!fileName || parts.includes('thumbs')) return imageUrl;
      const pIndex = parts.indexOf('p');
      if (pIndex !== -1) {
        parts.push('thumbs', fileName);
        url.pathname = parts.join('/');
        return url.toString();
      }
    } catch (_) {}
    return imageUrl.replace(/\/p\/(.+)\/([^/]+)$/i, '/p/$1/thumbs/$2');
  }

  function visibleGalleryItems(root = document) {
    return Array.from(root.querySelectorAll('.box, .boxtop'))
      .map((box) => {
        const link = box.querySelector('a.swipebox');
        if (!link || !link.href) return null;
        const img = link.querySelector('img.inbox');
        return {
          box,
          checkbox: box.querySelector('input[type="checkbox"][name^="item"]'),
          url: link.href,
          thumbUrl: img?.src || getThumbUrl(link.href),
          title: img?.title || link.title || decodeURIComponent(link.href.split('/').pop() || '')
        };
      })
      .filter(Boolean);
  }

  function selectedGalleryItems() {
    return visibleGalleryItems().filter((item) => item.checkbox && item.checkbox.checked);
  }

  window.OPUg.opu = {
    isUserPanel,
    isSettingsPage,
    isUploadPage,
    getThumbUrl,
    visibleGalleryItems,
    selectedGalleryItems
  };
})();



(function () {
  'use strict';

  function addStyle() {
    if (document.getElementById('opug-style')) return;
    const style = document.createElement('style');
    style.id = 'opug-style';
    style.textContent = `
      #opug-panel {
        margin: 10px auto 14px;
        padding: 10px;
        max-width: 920px;
        border: 1px solid #666;
        background: #171717;
        color: #ddd;
        font: 14px Arial, sans-serif;
      }
      #opug-panel input {
        background: #050505;
        color: #eee;
        border: 1px solid #777;
        padding: 5px 7px;
      }
      #opug-panel button {
        margin-left: 6px;
        padding: 5px 9px;
        cursor: pointer;
      }
      #opug-results {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .opug-result {
        width: 104px;
        border: 1px solid #444;
        background: #000;
        cursor: pointer;
      }
      .opug-result img {
        width: 100%;
        height: 90px;
        object-fit: cover;
        display: block;
      }
      .opug-result div {
        padding: 4px;
        color: #aaa;
        font-size: 11px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      #opug-status {
        margin-left: 8px;
        color: #aaa;
      }
    `;
    document.head.appendChild(style);
  }

  function setStatus(text) {
    const status = document.getElementById('opug-status');
    if (status) status.textContent = text;
  }

  function renderResults(records) {
    const results = document.getElementById('opug-results');
    if (!results) return;
    results.innerHTML = '';
    records.forEach((record) => {
      const item = document.createElement('div');
      item.className = 'opug-result';
      item.title = record.url;

      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = record.thumbUrl || record.url;

      const label = document.createElement('div');
      label.textContent = record.tagsNorm.join(', ');

      item.appendChild(img);
      item.appendChild(label);
      item.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(record.url);
          setStatus('Copied URL.');
        } catch (_) {
          window.open(record.url, '_blank', 'noopener,noreferrer');
        }
      });
      results.appendChild(item);
    });
  }

  function injectUserPanel() {
    addStyle();
    if (document.getElementById('opug-panel')) return;

    const anchor = document.querySelector('.box-wrap') || document.querySelector('.opunadpis');
    if (!anchor) return;

    const panel = document.createElement('div');
    panel.id = 'opug-panel';
    panel.innerHTML = `
      <strong>OPUg</strong>
      <input id="opug-tags" type="text" placeholder="tags: cat reaction game">
      <button id="opug-tag-selected" type="button">Tag selected</button>
      <button id="opug-search" type="button">Search</button>
      <span id="opug-status"></span>
      <div id="opug-results"></div>
    `;

    anchor.parentNode.insertBefore(panel, anchor);

    document.getElementById('opug-tag-selected').addEventListener('click', async () => {
      const tags = document.getElementById('opug-tags').value;
      const selected = window.OPUg.opu.selectedGalleryItems();
      if (!selected.length) {
        setStatus('No selected OPU images.');
        return;
      }
      setStatus(`Saving ${selected.length}...`);
      try {
        for (const item of selected) {
          await window.OPUg.firebase.saveUpload({
            url: item.url,
            thumbUrl: item.thumbUrl,
            title: item.title,
            tags
          });
        }
        setStatus(`Saved ${selected.length}.`);
      } catch (error) {
        setStatus(error.message || String(error));
      }
    });

    document.getElementById('opug-search').addEventListener('click', async () => {
      const tags = document.getElementById('opug-tags').value;
      setStatus('Searching...');
      try {
        const records = await window.OPUg.firebase.searchByTags(tags);
        renderResults(records);
        setStatus(`${records.length} result(s).`);
      } catch (error) {
        setStatus(error.message || String(error));
      }
    });
  }

  window.OPUg.ui = {
    injectUserPanel,
    setStatus,
    renderResults
  };
})();



(function () {
  'use strict';

  function init() {
    if (window.OPUg.opu.isUserPanel()) {
      window.OPUg.ui.injectUserPanel();
      return;
    }

    if (window.OPUg.opu.isUploadPage()) {
      // Upload-result capture belongs here. Keep MVP read/tag work on userpanel first.
      return;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

