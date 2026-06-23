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

