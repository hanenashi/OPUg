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

