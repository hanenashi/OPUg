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

