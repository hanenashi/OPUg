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

