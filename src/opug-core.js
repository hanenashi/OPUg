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
