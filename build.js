const fs = require('fs');

const header = `// ==UserScript==
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

`;

const files = [
  'src/opug-config.js',
  'src/opug-firebase.js',
  'src/opug-opu.js',
  'src/opug-ui.js',
  'src/opug-core.js'
];

const output = header + files.map((file) => fs.readFileSync(file, 'utf8')).join('\n\n');
fs.writeFileSync('OPUg.user.js', output);
console.log('Built OPUg.user.js');
