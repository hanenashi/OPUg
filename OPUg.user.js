// ==UserScript==
// @name         OPUg
// @namespace    https://github.com/hanenashi/OPUg
// @version      0.1.0-dev
// @description  Firebase-backed tags and custom galleries for opu.peklo.biz uploads.
// @author       hanenashi
// @match        https://opu.peklo.biz/
// @match        https://opu.peklo.biz/opupload.php*
// @match        https://opu.peklo.biz/?page=done*
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

  function storageKey() {
    return 'opug_upload_index_v1';
  }

  function readLocalIndex() {
    try {
      return JSON.parse(localStorage.getItem(storageKey()) || '{}');
    } catch (_) {
      return {};
    }
  }

  function writeLocalIndex(index) {
    localStorage.setItem(storageKey(), JSON.stringify(index));
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
    if (!isConfigured()) {
      const index = readLocalIndex();
      const existing = index[id] || {};
      const nextTags = record.replaceTags ? tagsNorm : Array.from(new Set([...(existing.tagsNorm || []), ...tagsNorm]));
      const next = {
        ...existing,
        id,
        url: record.url,
        thumbUrl: record.thumbUrl || existing.thumbUrl || record.url,
        title: record.title || existing.title || '',
        owner: record.owner || existing.owner || window.OPUg.config.firebase.ownerId,
        source: 'opu',
        tagsNorm: nextTags,
        createdAtMs: existing.createdAtMs || Date.now(),
        updatedAtMs: Date.now()
      };
      index[id] = next;
      writeLocalIndex(index);
      return next;
    }
    const body = { fields: toFirestoreFields({ ...record, tagsNorm }) };
    await firestoreRequest('PATCH', `/uploads/${id}`, body);
    return { ...record, id, tagsNorm };
  }

  function getUploadByUrl(url) {
    const id = docIdForUrl(url);
    return readLocalIndex()[id] || null;
  }

  async function setUploadTags(record) {
    return saveUpload({ ...record, replaceTags: true });
  }

  async function searchByTags(rawTags) {
    const tags = parseTags(rawTags);
    if (tags.length === 0) return [];

    if (!isConfigured()) {
      return Object.values(readLocalIndex())
        .filter((record) => tags.every((tag) => (record.tagsNorm || []).includes(tag)))
        .sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
    }

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
    readLocalIndex,
    getUploadByUrl,
    saveUpload,
    setUploadTags,
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

  function isUploadResultPage() {
    return window.location.origin === 'https://opu.peklo.biz'
      && (window.location.pathname.endsWith('/opupload.php') || window.location.search.includes('page=done'));
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

  function extractUploadedLinks(root = document) {
    const urls = new Set();
    root.querySelectorAll('input[id^="link_"], input[value*="opu.peklo.biz/p/"]').forEach((input) => {
      const value = input.value || '';
      const hrefMatch = value.match(/href=["']([^"']+)["']/i);
      const rawMatch = value.match(/https?:\/\/opu\.peklo\.biz\/p\/[^\s"'<>]+/i);
      const url = hrefMatch?.[1] || rawMatch?.[0] || '';
      if (url) urls.add(url);
    });
    root.querySelectorAll('a[href*="opu.peklo.biz/p/"]').forEach((link) => {
      if (link.href) urls.add(link.href);
    });
    return Array.from(urls).map((url) => ({
      url,
      thumbUrl: getThumbUrl(url),
      title: decodeURIComponent(url.split('/').pop() || '')
    }));
  }

  window.OPUg.opu = {
    isUserPanel,
    isSettingsPage,
    isUploadPage,
    isUploadResultPage,
    getThumbUrl,
    visibleGalleryItems,
    selectedGalleryItems,
    extractUploadedLinks
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
      .opug-box-tags {
        margin-top: 5px;
        padding-top: 5px;
        border-top: 1px solid #333;
        color: #aaa;
        font: 11px Arial, sans-serif;
      }
      .opug-box-tags input,
      .opug-upload-tags input {
        background: #050505;
        color: #eee;
        border: 1px solid #666;
        padding: 3px 5px;
        font-size: 11px;
      }
      .opug-box-tags input {
        width: 132px;
      }
      .opug-box-tags button {
        margin-left: 4px;
        padding: 2px 5px;
        font-size: 11px;
        cursor: pointer;
      }
      .opug-tag-list {
        display: block;
        margin-top: 3px;
        color: #c9c15a;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .opug-upload-tags {
        margin-top: 8px;
        color: #aaa;
        font: 13px Arial, sans-serif;
      }
      .opug-upload-tags input {
        width: min(480px, 80vw);
        margin-left: 6px;
      }
      #opug-result-tags {
        margin: 12px auto;
        padding: 10px;
        max-width: 920px;
        border: 1px solid #666;
        background: #171717;
        color: #ddd;
        font: 13px Arial, sans-serif;
      }
      #opug-result-tags input {
        width: min(520px, 78vw);
        margin: 0 6px;
        background: #050505;
        color: #eee;
        border: 1px solid #666;
        padding: 4px 6px;
      }
      #opug-result-tags button {
        padding: 4px 8px;
        cursor: pointer;
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

  function clearNativeGalleryFilter() {
    window.OPUg.opu.visibleGalleryItems().forEach((item) => {
      item.box.style.display = '';
    });
  }

  function filterNativeGallery(records) {
    const urls = new Set(records.map((record) => record.url));
    let visible = 0;
    window.OPUg.opu.visibleGalleryItems().forEach((item) => {
      const match = urls.has(item.url);
      item.box.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    return visible;
  }

  function tagsTextForUrl(url) {
    const record = window.OPUg.firebase.getUploadByUrl(url);
    return (record?.tagsNorm || []).join(' ');
  }

  function updateBoxTagsDisplay(row, url) {
    const tags = tagsTextForUrl(url);
    const display = row.querySelector('.opug-tag-list');
    if (display) display.textContent = tags ? `tags: ${tags}` : 'tags: none';
    const input = row.querySelector('input');
    if (input && document.activeElement !== input) input.value = tags;
  }

  function injectGalleryTagControls() {
    addStyle();
    window.OPUg.opu.visibleGalleryItems().forEach((item) => {
      if (item.box.querySelector('.opug-box-tags')) {
        updateBoxTagsDisplay(item.box.querySelector('.opug-box-tags'), item.url);
        return;
      }

      const row = document.createElement('div');
      row.className = 'opug-box-tags';
      row.innerHTML = `
        <input type="text" title="OPUg tags" placeholder="tags" value="">
        <button type="button">tag</button>
        <span class="opug-tag-list"></span>
      `;
      const input = row.querySelector('input');
      const button = row.querySelector('button');
      input.value = tagsTextForUrl(item.url);
      button.addEventListener('click', async () => {
        const saved = await window.OPUg.firebase.setUploadTags({
          url: item.url,
          thumbUrl: item.thumbUrl,
          title: item.title,
          tags: input.value
        });
        input.value = (saved?.tagsNorm || []).join(' ');
        updateBoxTagsDisplay(row, item.url);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          button.click();
        }
      });
      item.box.appendChild(row);
      updateBoxTagsDisplay(row, item.url);
    });
  }

  function defaultTagsFromFiles(files) {
    return Array.from(files || [])
      .map((file) => file.name.replace(/\.[^.]+$/, ''))
      .map((name) => window.OPUg.firebase.normalizeTag(name))
      .filter(Boolean)
      .join(' ');
  }

  function injectUploadTagging() {
    addStyle();
    const input = document.querySelector('#obrazek');
    const form = document.querySelector('form#xpc');
    if (!input || !form || document.getElementById('opug-upload-tags')) return;

    const row = document.createElement('div');
    row.id = 'opug-upload-tags';
    row.className = 'opug-upload-tags';
    row.innerHTML = 'OPUg tags:<input type="text" placeholder="optional tags">';
    input.insertAdjacentElement('afterend', row);
    const tagInput = row.querySelector('input');

    input.addEventListener('change', () => {
      if (!tagInput.value.trim()) tagInput.value = defaultTagsFromFiles(input.files);
      sessionStorage.setItem('opug_pending_upload_tags', tagInput.value.trim());
    });
    tagInput.addEventListener('input', () => {
      sessionStorage.setItem('opug_pending_upload_tags', tagInput.value.trim());
    });
    form.addEventListener('submit', () => {
      sessionStorage.setItem('opug_pending_upload_tags', tagInput.value.trim());
    });
  }

  async function captureUploadResults() {
    const links = window.OPUg.opu.extractUploadedLinks();
    if (!links.length) {
      injectUploadTagging();
      return;
    }
    const fallbackTags = links.map((link) => link.title.replace(/\.[^.]+$/, '')).map(window.OPUg.firebase.normalizeTag).join(' ');
    const tags = sessionStorage.getItem('opug_pending_upload_tags') || fallbackTags;
    if (tags.trim()) {
      for (const link of links) {
        await window.OPUg.firebase.saveUpload({ ...link, tags });
      }
      sessionStorage.removeItem('opug_pending_upload_tags');
    }
    injectResultTagging(links, tags || fallbackTags);
  }

  function injectResultTagging(links, initialTags) {
    addStyle();
    if (document.getElementById('opug-result-tags')) return;
    const anchor = document.querySelector('.opunadpis') || document.body.firstElementChild || document.body;
    const panel = document.createElement('div');
    panel.id = 'opug-result-tags';
    panel.innerHTML = `
      <strong>OPUg uploaded tags</strong>
      <input type="text" value="">
      <button type="button">save tags</button>
      <span id="opug-result-status"></span>
    `;
    anchor.insertAdjacentElement('afterend', panel);
    const input = panel.querySelector('input');
    const button = panel.querySelector('button');
    const status = panel.querySelector('#opug-result-status');
    input.value = initialTags || '';
    button.addEventListener('click', async () => {
      for (const link of links) {
        await window.OPUg.firebase.setUploadTags({ ...link, tags: input.value });
      }
      status.textContent = ` saved ${links.length}`;
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
    setStatus(window.OPUg.firebase.isConfigured() ? 'Firestore backend.' : 'Local backend.');

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
        injectGalleryTagControls();
        setStatus(`Saved ${selected.length}.`);
      } catch (error) {
        setStatus(error.message || String(error));
      }
    });

    document.getElementById('opug-search').addEventListener('click', async () => {
      const tags = document.getElementById('opug-tags').value;
      if (!tags.trim()) {
        clearNativeGalleryFilter();
        renderResults([]);
        setStatus('Showing all.');
        return;
      }
      setStatus('Searching...');
      try {
        const records = await window.OPUg.firebase.searchByTags(tags);
        renderResults([]);
        const visible = filterNativeGallery(records);
        setStatus(`${visible} visible / ${records.length} tagged.`);
      } catch (error) {
        setStatus(error.message || String(error));
      }
    });

    document.getElementById('opug-tags').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        document.getElementById('opug-search').click();
      }
    });

    injectGalleryTagControls();
  }

  window.OPUg.ui = {
    captureUploadResults,
    clearNativeGalleryFilter,
    filterNativeGallery,
    injectGalleryTagControls,
    injectUploadTagging,
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

    if (window.OPUg.opu.extractUploadedLinks().length > 0) {
      window.OPUg.ui.captureUploadResults();
      return;
    }

    if (window.OPUg.opu.isUploadPage()) {
      window.OPUg.ui.injectUploadTagging();
      return;
    }

    if (window.OPUg.opu.isUploadResultPage()) {
      window.OPUg.ui.captureUploadResults();
      return;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
