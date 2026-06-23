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
