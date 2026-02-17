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

  const preloadPromise = new Promise(resolve => {
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
    img.src = key;
    if (typeof img.decode === 'function') {
      img.decode().then(() => finish(true)).catch(() => {
        // Keep onload/onerror fallback active.
      });
    }
    setTimeout(() => finish(false), 10000);
  });

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
    previewEl.innerHTML = `
          <div class="image-preview-empty-state" aria-hidden="true">
            <img class="image-preview-drop-icon" src="icons/drop_image.png" alt="" style="width: 48px; height: 48px;"/>
          </div>
        `;
    return;
  }
  previewEl.classList.add('has-image');
  previewEl.classList.toggle('single-image', images.length === 1);
  previewEl.classList.toggle('multi-image', images.length > 1);
  previewEl.innerHTML = '';

  const createImageWrap = (src, idx, variant = 'single') => {
    const wrap = document.createElement('div');
    wrap.className = `image-preview-wrap image-preview-wrap-${variant}`;
    const img = document.createElement('img');
    img.src = src;
    img.alt = `preview ${idx + 1}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'image-remove-btn';
    btn.setAttribute('aria-label', `Remove image ${idx + 1}`);
    btn.innerHTML = '<img src="icons/trash.svg" alt="" aria-hidden="true">';
    btn.onclick = e => {
      e.stopPropagation();
      if (typeof onRemoveAt === 'function') onRemoveAt(idx);
    };
    wrap.append(img, btn);
    return wrap;
  };

  const createDropTile = (variant = 'single') => {
    const tile = document.createElement('div');
    tile.className = `image-preview-drop-tile image-preview-drop-tile-${variant}`;
    tile.innerHTML = '<img class="image-preview-drop-icon" src="icons/drop_image.png" alt="" aria-hidden="true">';
    tile.setAttribute('title', 'Drop more images');
    return tile;
  };

  if (images.length === 1) {
    const row = document.createElement('div');
    row.className = 'image-preview-single-layout';
    row.appendChild(createImageWrap(images[0], 0, 'single'));
    row.appendChild(createDropTile('single'));
    previewEl.appendChild(row);
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
  row.appendChild(createDropTile('multi'));
  previewEl.appendChild(row);
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

    const isDropTileClick = !!clickTarget.closest('.image-preview-drop-tile');
    const isEmptyStateClick = !!clickTarget.closest('.image-preview-empty-state');
    const isDropIconClick = clickTarget.classList.contains('image-preview-drop-icon');
    const isEmptyContainerClick = clickTarget === target && !target.classList.contains('has-image');
    if (!isDropTileClick && !isEmptyStateClick && !isDropIconClick && !isEmptyContainerClick) return;

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
    thumb.src = src;
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

async function buildCardImagePayloadForSave(cardId, imagesQ, imagesA) {
  void cardId;
  return getCardImagePayload(
    normalizeImageList(imagesQ),
    normalizeImageList(imagesA)
  );
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

