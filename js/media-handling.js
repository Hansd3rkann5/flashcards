// Media Handling (Image Upload, Preview, Lightbox)
// ============================================================================
/**
* @function fileToDataUrl
 * @description Converts a File object to a base64 data URL.
 */

function fileToDataUrl(file) {
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(file);
  });
}

/**
 * @function normalizeImageList
 * @description Normalizes image list.
 */

function normalizeImageList(rawImages, fallbackImage = '') {
  const images = [];
  const seen = new Set();
  const push = value => {
    const src = typeof value === 'string' ? value.trim() : '';
    if (!src || seen.has(src)) return;
    seen.add(src);
    images.push(src);
  };
  if (Array.isArray(rawImages)) rawImages.forEach(push);
  else if (rawImages && typeof rawImages === 'object' && typeof rawImages.length === 'number') {
    Array.from(rawImages).forEach(push);
  } else {
    push(rawImages);
  }
  if (!images.length) push(fallbackImage);
  return images;
}

/**
 * @function isImageDataUrl
 * @description Returns true when the source is an inline base64 image data URL.
 */

function isImageDataUrl(src = '') {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(src || '').trim());
}

/**
 * @function isSupabaseStorageRef
 * @description Returns true when the source uses an internal Supabase storage reference.
 */

function isSupabaseStorageRef(src = '') {
  return /^sb:\/\/[^/]+\/.+/i.test(String(src || '').trim());
}

/**
 * @function parseSupabaseStorageRef
 * @description Parses a storage reference like sb://bucket/path/to/file.jpg.
 */

function parseSupabaseStorageRef(src = '') {
  const raw = String(src || '').trim();
  const match = raw.match(/^sb:\/\/([^/]+)\/(.+)$/i);
  if (!match) return null;
  const bucket = String(match[1] || '').trim();
  const path = String(match[2] || '').trim().replace(/^\/+/, '');
  if (!bucket || !path) return null;
  return { bucket, path };
}

/**
 * @function buildSupabaseStorageRef
 * @description Builds a stable storage reference string.
 */

function buildSupabaseStorageRef(bucket = '', path = '') {
  const safeBucket = String(bucket || '').trim();
  const safePath = String(path || '').trim().replace(/^\/+/, '');
  if (!safeBucket || !safePath) return '';
  return `sb://${safeBucket}/${safePath}`;
}

/**
 * @function parseImageDataUrlPayload
 * @description Decodes a base64 image data URL into binary bytes + MIME metadata.
 */

function parseImageDataUrlPayload(src = '') {
  const raw = String(src || '').trim();
  const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;
  const mime = String(match[1] || '').toLowerCase();
  const b64 = String(match[2] || '');
  let bytes = null;
  try {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let idx = 0; idx < bin.length; idx += 1) arr[idx] = bin.charCodeAt(idx);
    bytes = arr;
  } catch (_) {
    bytes = null;
  }
  if (!bytes) return null;
  return { mime, bytes };
}

/**
 * @function imageMimeToExtension
 * @description Maps a MIME type to a file extension suitable for object storage.
 */

function imageMimeToExtension(mime = '') {
  const safe = String(mime || '').toLowerCase().trim();
  if (safe === 'image/jpeg' || safe === 'image/jpg') return 'jpg';
  if (safe === 'image/png') return 'png';
  if (safe === 'image/webp') return 'webp';
  if (safe === 'image/gif') return 'gif';
  if (safe === 'image/svg+xml') return 'svg';
  if (safe === 'image/avif') return 'avif';
  if (safe === 'image/bmp') return 'bmp';
  return 'bin';
}

/**
 * @function hashImageSource
 * @description Creates a deterministic short hash for stable storage object names.
 */

function hashImageSource(src = '') {
  const raw = String(src || '');
  let hash = 0x811c9dc5;
  for (let idx = 0; idx < raw.length; idx += 1) {
    hash ^= raw.charCodeAt(idx);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * @function sanitizeStoragePathSegment
 * @description Sanitizes one storage path segment.
 */

function sanitizeStoragePathSegment(value = '', fallback = 'x') {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return cleaned || fallback;
}

/**
 * @function resolveImageSourceForDisplay
 * @description Resolves storage refs to signed/public URLs and caches results for rendering/preload.
 */

async function resolveImageSourceForDisplay(src = '') {
  const raw = String(src || '').trim();
  if (!raw) return '';
  if (!isSupabaseStorageRef(raw)) return raw;

  const ref = parseSupabaseStorageRef(raw);
  if (!ref) return '';
  const key = `${ref.bucket}/${ref.path}`;
  const now = Date.now();
  const cached = storageImageResolvedUrlCache.get(key);
  if (cached && cached.url && Number(cached.expiresAt || 0) > now) {
    return cached.url;
  }
  if (storageImageResolveInFlight.has(key)) {
    return storageImageResolveInFlight.get(key);
  }

  const resolvePromise = (async () => {
    await initSupabaseBackend();
    const bucketClient = supabaseClient.storage.from(ref.bucket);
    const signed = await bucketClient.createSignedUrl(ref.path, 60 * 60);
    const signedUrl = String(signed?.data?.signedUrl || '').trim();
    if (signedUrl) {
      storageImageResolvedUrlCache.set(key, {
        url: signedUrl,
        expiresAt: Date.now() + (55 * 60 * 1000)
      });
      return signedUrl;
    }

    // Fallback for public buckets.
    const publicData = bucketClient.getPublicUrl(ref.path);
    const publicUrl = String(publicData?.data?.publicUrl || '').trim();
    if (publicUrl) {
      storageImageResolvedUrlCache.set(key, {
        url: publicUrl,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000)
      });
      return publicUrl;
    }

    const fallbackMessage = String(signed?.error?.message || '').trim() || 'Failed to resolve storage image URL.';
    throw new Error(fallbackMessage);
  })();

  storageImageResolveInFlight.set(key, resolvePromise);
  try {
    return await resolvePromise;
  } finally {
    if (storageImageResolveInFlight.get(key) === resolvePromise) {
      storageImageResolveInFlight.delete(key);
    }
  }
}

/**
 * @function bindImageElementSource
 * @description Binds an image element to plain URLs or storage refs with async resolution.
 */

function bindImageElementSource(img, src = '') {
  if (!(img instanceof HTMLImageElement)) return;
  const raw = String(src || '').trim();
  img.dataset.imageSource = raw;
  if (!raw) {
    img.removeAttribute('src');
    return;
  }
  if (!isSupabaseStorageRef(raw)) {
    img.src = raw;
    return;
  }
  img.removeAttribute('src');
  void resolveImageSourceForDisplay(raw)
    .then(url => {
      if (String(img.dataset.imageSource || '') !== raw) return;
      img.src = url;
    })
    .catch(err => {
      console.warn('Failed to resolve storage image source:', err);
      if (String(img.dataset.imageSource || '') !== raw) return;
      img.removeAttribute('src');
    });
}

/**
 * @function uploadImageDataUrlToStorage
 * @description Uploads one image data URL to Supabase Storage and returns a stable storage ref.
 */

async function uploadImageDataUrlToStorage(dataUrl, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const log = typeof opts.log === 'function' ? opts.log : null;
  const parsed = parseImageDataUrlPayload(dataUrl);
  if (!parsed) throw new Error('Invalid image data URL.');
  await initSupabaseBackend();
  const ownerId = await getSupabaseOwnerId();
  const bucket = String(SUPABASE_PICTURES_BUCKET || 'Pictures').trim();
  if (!bucket) throw new Error('Missing Supabase pictures bucket configuration.');

  const cardId = sanitizeStoragePathSegment(opts.cardId || uid(), 'card');
  const side = String(opts.side || 'Q').toUpperCase() === 'A' ? 'a' : 'q';
  const index = Number.isFinite(Number(opts.index)) ? Math.max(0, Math.trunc(Number(opts.index))) : 0;
  const ext = imageMimeToExtension(parsed.mime);
  const hash = hashImageSource(dataUrl);
  const fileName = `${side}-${String(index + 1).padStart(2, '0')}-${hash}.${ext}`;
  const path = `${sanitizeStoragePathSegment(ownerId, 'owner')}/${cardId}/${fileName}`;
  if (log) log(`Storage upload start: ${path}`);

  const { error } = await supabaseClient.storage
    .from(bucket)
    .upload(path, parsed.bytes, {
      contentType: parsed.mime,
      upsert: true,
      cacheControl: '31536000'
    });
  if (error && log) {
    log(`Storage upload failed: ${path} -> ${String(error?.message || 'unknown error')}`);
  }
  assertSupabaseSuccess(error, 'Failed to upload image to Supabase Storage.');
  if (log) log(`Storage upload done: ${path} (${parsed.bytes.length} bytes)`);
  return buildSupabaseStorageRef(bucket, path);
}

/**
 * @function persistCardImageSourcesToStorage
 * @description Converts inline image data URLs to storage refs while keeping existing refs/URLs untouched.
 */

async function persistCardImageSourcesToStorage(cardId, side = 'Q', images = [], options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const log = typeof opts.log === 'function' ? opts.log : null;
  const safeCardId = String(cardId || '').trim() || uid();
  const safeSide = String(side || 'Q').toUpperCase() === 'A' ? 'A' : 'Q';
  const normalized = normalizeImageList(images);
  if (!normalized.length) return [];
  const persisted = [];
  for (let idx = 0; idx < normalized.length; idx += 1) {
    const src = String(normalized[idx] || '').trim();
    if (!src) continue;
    if (!isImageDataUrl(src)) {
      if (log) log(`Keep existing ${safeSide} image #${idx + 1} (already URL/ref).`);
      persisted.push(src);
      continue;
    }
    if (log) log(`Convert ${safeSide} image #${idx + 1} from base64 to Storage.`);
    const storageRef = await uploadImageDataUrlToStorage(src, {
      cardId: safeCardId,
      side: safeSide,
      index: idx,
      log
    });
    persisted.push(storageRef);
  }
  return normalizeImageList(persisted);
}

/**
 * @function getCardLegacyBase64Stats
 * @description Returns detailed counts of inline base64 image payloads per card field.
 */

function getCardLegacyBase64Stats(card = null) {
  const safeCard = (card && typeof card === 'object') ? card : {};
  const listQ = normalizeImageList(safeCard.imagesQ).filter(isImageDataUrl).length;
  const listA = normalizeImageList(safeCard.imagesA).filter(isImageDataUrl).length;
  const legacyQ = isImageDataUrl(safeCard.imageDataQ) ? 1 : 0;
  const legacyA = isImageDataUrl(safeCard.imageDataA) ? 1 : 0;
  const legacyGeneric = isImageDataUrl(safeCard.imageData) ? 1 : 0;
  const total = listQ + listA + legacyQ + legacyA + legacyGeneric;
  return {
    listQ,
    listA,
    legacyQ,
    legacyA,
    legacyGeneric,
    total
  };
}

/**
 * @function cardHasLegacyBase64Images
 * @description Returns true when a card still contains inline base64 image payloads.
 */

function cardHasLegacyBase64Images(card = null) {
  return getCardLegacyBase64Stats(card).total > 0;
}

/**
 * @function getCardImageList
 * @description Returns the card image list.
 */

function getCardImageList(card, side = 'Q') {
  const key = String(side || 'Q').toUpperCase() === 'A' ? 'A' : 'Q';
  const listKey = key === 'Q' ? 'imagesQ' : 'imagesA';
  const fallback = key === 'Q'
    ? card?.imageDataQ || card?.imageData || ''
    : card?.imageDataA || '';
  return normalizeImageList(card?.[listKey], fallback);
}

/**
 * @function resetSessionImagePreloadCache
 * @description Clears the in-memory image preload cache used to warm upcoming study cards.
 */

function resetSessionImagePreloadCache() {
  sessionImagePreloadCache.clear();
}

/**
 * @function preloadSessionImageSource
 * @description Preloads one image source so the next study cards render without image decode lag.
 */

function preloadSessionImageSource(src = '') {
  const key = String(src || '').trim();
  if (!key) return Promise.resolve(false);
  const cached = sessionImagePreloadCache.get(key);
  if (cached) return cached;

  if (sessionImagePreloadCache.size >= SESSION_IMAGE_PRELOAD_CACHE_MAX) {
    const oldestKey = sessionImagePreloadCache.keys().next().value;
    if (oldestKey) sessionImagePreloadCache.delete(oldestKey);
  }

  const preloadPromise = (async () => {
    let resolvedSrc = '';
    try {
      resolvedSrc = await resolveImageSourceForDisplay(key);
    } catch (_) {
      return false;
    }
    if (!resolvedSrc) return false;
    return new Promise(resolve => {
      const img = new Image();
      let settled = false;
      const finish = ok => {
        if (settled) return;
        settled = true;
        img.onload = null;
        img.onerror = null;
        resolve(!!ok);
      };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      img.decoding = 'async';
      img.src = resolvedSrc;
      if (typeof img.decode === 'function') {
        img.decode().then(() => finish(true)).catch(() => {
          // Keep onload/onerror fallback active.
        });
      }
      setTimeout(() => finish(false), 10000);
    });
  })();

  sessionImagePreloadCache.set(key, preloadPromise);
  return preloadPromise;
}

/**
 * @function warmSessionCardAssets
 * @description Starts background preload for all images used by one study card.
 */

function warmSessionCardAssets(card = null) {
  if (!card || typeof card !== 'object') return;
  const allImages = normalizeImageList([
    ...getCardImageList(card, 'Q'),
    ...getCardImageList(card, 'A')
  ]);
  allImages.forEach(src => {
    void preloadSessionImageSource(src);
  });
}

/**
 * @function warmUpcomingSessionCards
 * @description Preloads current/next study cards so flips and transitions feel instant.
 */

function warmUpcomingSessionCards(lookAhead = 2) {
  const queue = Array.isArray(session?.activeQueue) ? session.activeQueue : [];
  if (!queue.length) return;
  const safeLookAhead = Number.isFinite(Number(lookAhead))
    ? Math.max(0, Math.trunc(Number(lookAhead)))
    : 2;
  const maxIdx = Math.min(queue.length - 1, safeLookAhead);
  for (let idx = 0; idx <= maxIdx; idx += 1) {
    warmSessionCardAssets(queue[idx]);
  }
}

/**
 * @function getFieldImageList
 * @description Returns the field image list.
 */

function getFieldImageList(field, legacyKey = '') {
  if (!field) return [];
  let parsed = [];
  const raw = String(field.dataset.images || '').trim();
  if (raw) {
    try {
      const payload = JSON.parse(raw);
      parsed = normalizeImageList(payload);
    } catch (err) {
      parsed = normalizeImageList(raw);
    }
  }
  return normalizeImageList(parsed, field.dataset[legacyKey] || '');
}

/**
 * @function setFieldImageList
 * @description Sets the field image list.
 */

function setFieldImageList(field, images, legacyKey = '') {
  if (!field) return [];
  const normalized = normalizeImageList(images);
  if (normalized.length) field.dataset.images = JSON.stringify(normalized);
  else delete field.dataset.images;
  if (legacyKey) field.dataset[legacyKey] = normalized[0] || '';
  return normalized;
}

/**
 * @function setImagePreview
 * @description Sets the image preview.
 */

function setImagePreview(previewEl, dataUrls, onRemoveAt) {
  if (!previewEl) return;
  const images = normalizeImageList(dataUrls);
  if (!images.length) {
    previewEl.classList.remove('has-image', 'single-image', 'multi-image');
    previewEl.setAttribute('title', 'Drop image or click to upload');
    previewEl.innerHTML = `
          <div class="image-preview-empty-state" aria-hidden="true">
            <img class="app-icon" src="icons/drop_image.png" alt="" style="width: 48px; height: 48px;" />
          </div>
        `;
    return;
  }
  previewEl.classList.add('has-image');
  previewEl.classList.toggle('single-image', images.length === 1);
  previewEl.classList.toggle('multi-image', images.length > 1);
  previewEl.setAttribute('title', 'Drop more images or click to upload');
  previewEl.innerHTML = '';

  const appendUploadOverlayButton = () => {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'image-preview-upload-btn innerGlow';
    addBtn.setAttribute('aria-label', 'Add images');
    addBtn.setAttribute('title', 'Drop more images or click to upload');
    addBtn.innerHTML = '<span aria-hidden="true">+</span>';
    previewEl.appendChild(addBtn);
  };

  const createImageWrap = (src, idx, variant = 'single') => {
    const wrap = document.createElement('div');
    wrap.className = `image-preview-wrap image-preview-wrap-${variant}`;
    const img = document.createElement('img');
    bindImageElementSource(img, src);
    img.alt = `preview ${idx + 1}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'image-remove-btn innerGlow';
    btn.setAttribute('aria-label', `Remove image ${idx + 1}`);
    btn.innerHTML = '<img src="icons/trash.png" alt="" aria-hidden="true" class="app-icon">';
    btn.onclick = e => {
      e.stopPropagation();
      if (typeof onRemoveAt === 'function') onRemoveAt(idx);
    };
    wrap.append(img, btn);
    return wrap;
  };

  if (images.length === 1) {
    const row = document.createElement('div');
    row.className = 'image-preview-single-layout';
    row.appendChild(createImageWrap(images[0], 0, 'single'));
    previewEl.appendChild(row);
    appendUploadOverlayButton();
    return;
  }

  const row = document.createElement('div');
  row.className = 'image-preview-multi-layout';
  const stack = document.createElement('div');
  stack.className = 'image-preview-stack';
  images.forEach((src, idx) => {
    const wrap = createImageWrap(src, idx, 'stack');
    const offsetX = Math.min(10 * idx, 36);
    const rotation = idx === 0 ? -10 : idx === 1 ? 0 : Math.min(10 + (idx - 2) * 2, 16);
    wrap.style.setProperty('--stack-left', `${offsetX}px`);
    wrap.style.setProperty('--stack-rotation', `${rotation}deg`);
    wrap.style.setProperty('--stack-z', String(idx + 1));
    stack.appendChild(wrap);
  });
  row.appendChild(stack);
  previewEl.appendChild(row);
  appendUploadOverlayButton();
}

/**
 * @function syncFieldImagePreview
 * @description Synchronizes field image preview.
 */

function syncFieldImagePreview(field, previewEl, legacyKey = '', onChange = null) {
  if (!field || !previewEl) return;
  const images = getFieldImageList(field, legacyKey);
  setImagePreview(previewEl, images, removeIdx => {
    const current = getFieldImageList(field, legacyKey);
    const next = current.filter((_, idx) => idx !== removeIdx);
    setFieldImageList(field, next, legacyKey);
    syncFieldImagePreview(field, previewEl, legacyKey, onChange);
    if (typeof onChange === 'function') onChange(next);
  });
}

/**
 * @function appendImagesToField
 * @description Converts append images to field.
 */

function appendImagesToField(field, previewEl, newImages, legacyKey = '', onChange = null) {
  if (!field || !previewEl) return;
  const current = getFieldImageList(field, legacyKey);
  const next = normalizeImageList([...current, ...normalizeImageList(newImages)]);
  setFieldImageList(field, next, legacyKey);
  syncFieldImagePreview(field, previewEl, legacyKey, onChange);
  if (typeof onChange === 'function') onChange(next);
}

/**
 * @function replaceFieldImages
 * @description Handles replace field images logic.
 */

function replaceFieldImages(field, previewEl, images, legacyKey = '', onChange = null) {
  if (!field || !previewEl) return;
  const next = setFieldImageList(field, images, legacyKey);
  syncFieldImagePreview(field, previewEl, legacyKey, onChange);
  if (typeof onChange === 'function') onChange(next);
}

/**
 * @function attachImageDrop
 * @description Attaches handlers for image drop.
 */

function attachImageDrop(target, onImages) {
  if (!target) return;
  const prevent = e => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    target.addEventListener(evt, prevent);
  });
  target.addEventListener('drop', async e => {
    const files = Array.from(e.dataTransfer?.files || [])
      .filter(file => file && String(file.type || '').startsWith('image/'));
    if (!files.length) return;
    const dataUrls = normalizeImageList(await Promise.all(files.map(fileToDataUrl)));
    if (!dataUrls.length) return;
    if (typeof onImages === 'function') onImages(dataUrls);
  });
}

/**
 * @function attachImagePicker
 * @description Attaches handlers for image picker.
 */

function attachImagePicker(target, onImages) {
  if (!target) return;
  if (target.dataset.imagePickerBound === '1') return;
  target.dataset.imagePickerBound = '1';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;
  fileInput.tabIndex = -1;
  fileInput.setAttribute('aria-hidden', 'true');
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || [])
      .filter(file => file && String(file.type || '').startsWith('image/'));
    fileInput.value = '';
    if (!files.length) return;
    const dataUrls = normalizeImageList(await Promise.all(files.map(fileToDataUrl)));
    if (!dataUrls.length) return;
    if (typeof onImages === 'function') onImages(dataUrls);
  });

  target.addEventListener('click', e => {
    const clickTarget = e.target;
    if (!(clickTarget instanceof Element)) return;
    if (clickTarget.closest('.image-remove-btn')) return;
    e.preventDefault();
    fileInput.click();
  });
}

/**
 * @function appendCardImages
 * @description Handles append card images logic.
 */

function appendCardImages(container, images = [], className = 'card-thumb', altPrefix = 'Card image') {
  if (!container) return;
  const normalized = normalizeImageList(images);
  normalized.forEach((src, idx) => {
    const thumb = document.createElement('img');
    bindImageElementSource(thumb, src);
    thumb.className = className;
    thumb.alt = `${altPrefix} ${idx + 1}`;
    container.appendChild(thumb);
  });
}

/**
 * @function appendSessionImages
 * @description Handles append session images logic.
 */

function appendSessionImages(container, images = [], altPrefix = 'Card image') {
  if (!container) return;
  const normalized = normalizeImageList(images);
  normalized.forEach((src, idx) => {
    const img = buildSessionCardImage(src, `${altPrefix} ${idx + 1}`);
    container.appendChild(img);
  });
}

/**
 * @function buildCardImagePayloadForSave
 * @description Normalizes image lists for persistence in card records.
 */

async function buildCardImagePayloadForSave(cardId, imagesQ, imagesA, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const log = typeof opts.log === 'function' ? opts.log : null;
  const safeCardId = String(cardId || '').trim() || uid();
  const storedQ = await persistCardImageSourcesToStorage(
    safeCardId,
    'Q',
    normalizeImageList(imagesQ),
    { log }
  );
  const storedA = await persistCardImageSourcesToStorage(
    safeCardId,
    'A',
    normalizeImageList(imagesA),
    { log }
  );
  return getCardImagePayload(storedQ, storedA);
}

/**
 * @function getCardImagePayload
 * @description Returns the card image payload.
 */

function getCardImagePayload(imagesQ, imagesA) {
  const q = normalizeImageList(imagesQ);
  const a = normalizeImageList(imagesA);
  return {
    imagesQ: q,
    imagesA: a,
    imageDataQ: q[0] || '',
    imageDataA: a[0] || ''
  };
}
