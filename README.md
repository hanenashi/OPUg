# OPUg

OPUg is a companion userscript concept for adding user-owned tags, custom galleries,
and fast image search on top of Okoun Picture Uploader at `https://opu.peklo.biz/`.

## Install

[Install OPUg userscript](https://github.com/hanenashi/OPUg/raw/main/OPUg.user.js)

The core idea:

1. When an image is uploaded to OPU, capture the final OPU URL.
2. Let the user assign tags such as `reaction`, `game`, `cat`, `meme`, or `todo`.
3. Store `{ url, thumbUrl, tags, title, createdAt }` in a Firebase-backed index.
4. Inject a search and tag UI into the OPU user gallery.
5. Use that index to show custom galleries and live tag searches that OPU itself does
   not provide.

This repo starts as a separate experiment so it can borrow proven OPU script pieces
without disturbing the working `OPUh`, `OPUx`, or `OPUc_ultimate` installs.

## Target Pages

```text
https://opu.peklo.biz/
https://opu.peklo.biz/?page=userpanel*
https://opu.peklo.biz/?page=settings*
```

MVP should focus on the logged-in user panel first:

- add a tag/search bar above the native gallery
- let selected native OPU images be tagged manually
- search Firebase and render tagged results in a custom grid

After that works, the main uploader page can capture new upload results and ask for
tags immediately after upload.

## MVP

### Phase 1: User Panel Tagging

- Detect OPU user panel gallery boxes with `.box`, `.boxtop`, `a.swipebox`, and
  `img.inbox`.
- Add an `OPUg` panel above `.box-wrap`.
- Add a tag input and `Tag selected` button.
- Reuse the native checkbox state where possible so OPUx-style selection stays
  compatible.
- For each selected image, extract:
  - full image URL from `a.swipebox.href`
  - thumbnail URL from `img.inbox.src`
  - optional filename/title from `img.title`, link attributes, or URL basename
- Save records to Firebase.
- Show success/error status without blocking the native page.

### Phase 2: Live Search

- Add a search input.
- Normalize typed tags by trimming, lowercasing, removing duplicate whitespace, and
  splitting on comma or space.
- Query Firebase for one tag with `array-contains`.
- For multiple tags, fetch candidates using the first tag and filter client-side for
  all requested tags.
- Render results into a custom grid below the search bar.
- Clicking a result should:
  - copy the full URL by default
  - optionally open the image
  - later optionally insert into Okoun through OPUc integration

### Phase 3: Upload Capture

- Watch the main upload form at `https://opu.peklo.biz/`.
- Capture final OPU URLs from the upload response/page.
- Prompt for tags after successful upload.
- Store the uploaded URL and tags in the same Firebase index.

The upload page has recently gained native carousel preview and clipboard support, so
OPUg should not replace upload UI. It should only observe successful results and add a
small tagging flow.

## Firebase Shape

Recommended Firestore document:

```js
uploads/{docId} = {
  url: "https://opu.peklo.biz/p/12/34/56/image.jpg",
  thumbUrl: "https://opu.peklo.biz/p/12/34/56/thumbs/image.jpg",
  tags: ["reaction", "cat"],
  tagsNorm: ["reaction", "cat"],
  title: "optional note",
  owner: "local-user-id",
  source: "opu",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
}
```

Possible deterministic `docId`:

```text
base64url(sha256(url))
```

For a userscript MVP, a simpler URL-safe hash function is acceptable until we need
cross-device conflict handling.

## Security Notes

- Do not store OPU cookies, Okoun cookies, passwords, or browser profile data.
- Store only image URLs and tags the user is comfortable putting in Firebase.
- Treat Firebase config as public client config, not a secret.
- Use Firebase Auth and Firestore rules for real privacy.
- If this is single-user only, start with anonymous auth or a local owner id, then
  tighten rules before using it broadly.

Example rule direction:

```text
allow read, write: if request.auth != null
  && request.auth.uid == resource.data.owner;
```

Exact rules will depend on whether the index is single-user, shared, or public.

## Search Constraints

Firestore can do:

- `array-contains` for one tag
- `array-contains-any` for up to a limited set of alternatives
- ordered/paginated queries with indexes

Firestore does not do arbitrary substring search well. For OPUg, tag search should be
explicit tag search, not full text search.

Good MVP behavior:

- `cat` finds images tagged `cat`
- `cat reaction` finds images with both tags by fetching `cat` and filtering locally
- partial typed input can show matching known tags from a local tag cache

## Reusable Bits From Existing Repos

### OPUx

Useful for user panel integration:

- page detection for `?page=userpanel` and `?page=settings`
- `.box` / `.boxtop` gallery item selectors
- `a.swipebox` full image URL extraction
- `img.inbox` thumbnail extraction
- click-safe gallery selection patterns
- loading overlay and delayed pagination ideas

Files to study:

```text
/home/beechan/GIT/OPUx/src/opux-userpanel.js
/home/beechan/GIT/OPUx/src/opux-utils.js
/home/beechan/GIT/OPUx/src/opux-core.js
```

### OPUh

Useful for main upload page integration:

- `#obrazek` file input detection
- toast helper
- draggable floating button patterns
- URL parsing and image URL normalization helpers
- progress ring approach for long-running clipboard/fetch work
- `DataTransfer` use for rebuilding file inputs

Files to study:

```text
/home/beechan/GIT/OPUh/OPUh.user.js
```

Important current-site observation:

The public OPU upload page already has native carousel preview, native paste handling,
and accepts `.avif`, `.zip`, and `.mp4`. OPUg should avoid competing with that and
focus on tagging successful uploads.

### OPUc Ultimate

Useful for cross-origin and gallery parsing:

- `GM_xmlhttpRequest` / `GM.xmlHttpRequest` compatibility wrapper
- local settings wrapper with userscript storage fallback
- OPU gallery fetch and `DOMParser` parsing
- OPU thumbnail URL derivation from full image URL
- modal gallery UI patterns

Files to study:

```text
/home/beechan/GIT/OPUc_ultimate/modules/02-config.js
/home/beechan/GIT/OPUc_ultimate/modules/07-api.js
/home/beechan/GIT/OPUc_ultimate/modules/08-gallery.js
```

## Proposed Userscript Layout

```text
OPUg/
├── OPUg.user.js
├── README.md
├── build.js
└── src/
    ├── opug-config.js
    ├── opug-firebase.js
    ├── opug-opu.js
    ├── opug-ui.js
    └── opug-core.js
```

The generated `OPUg.user.js` should be installable directly in Tampermonkey or
Violentmonkey. Firebase config can initially be pasted into script settings, then
later moved to a setup panel.

## Open Decisions

- Firestore vs Realtime Database.
- Anonymous auth vs explicit Google/email auth vs local private API.
- Whether tags are private per user or shareable.
- Whether image deletion in OPU should also remove index records.
- Whether upload-time tags should be mandatory, optional, or last-tags default.
- Whether `OPUg` stays a companion script or gets merged into `OPUx` and `OPUh`.

## First Implementation Path

1. Build companion script that runs only on `?page=userpanel`.
2. Inject panel and parse visible gallery boxes.
3. Store/read Firebase config from userscript storage.
4. Add manual tagging for selected boxes.
5. Add tag search result grid.
6. Add old-upload backfill flow.
7. Add upload-result capture on the main page.
