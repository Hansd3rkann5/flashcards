"use strict";
// Shared loading helper component types (global script scope)
// ============================================================================
// Shared panel types (global script scope)
// ============================================================================
// Shared header component types (global script scope)
// ============================================================================
// DOM helpers for frontend TS components (global script scope)
// ============================================================================
function toSafeInt(value, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric))
        return fallback;
    return Math.trunc(numeric);
}
function classTokens(value) {
    return String(value || '')
        .split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean);
}
function joinClassNames(...values) {
    return values
        .flatMap(value => classTokens(value))
        .join(' ');
}
function applyClassNames(node, ...values) {
    values.forEach(value => {
        classTokens(value).forEach(token => node.classList.add(token));
    });
}
function applyInlineStyle(node, style) {
    if (!node || !style || typeof style !== 'object')
        return;
    Object.entries(style).forEach(([key, value]) => {
        if (value === null || value === undefined)
            return;
        node.style.setProperty(stylePropToKebabCase(key), String(value));
    });
}
const ComponentStyleSheet = {
    create(styles) {
        return styles;
    }
};
// Minimal JSX runtime for DOM-based TSX components (global script scope)
// ============================================================================
function appendJsxChild(parent, child) {
    if (Array.isArray(child)) {
        child.forEach(inner => appendJsxChild(parent, inner));
        return;
    }
    if (child === null || child === undefined || typeof child === 'boolean')
        return;
    if (child instanceof Node) {
        parent.appendChild(child);
        return;
    }
    parent.appendChild(document.createTextNode(String(child)));
}
function stylePropToKebabCase(value) {
    return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}
function setJsxProp(element, key, value) {
    if (key === 'children')
        return;
    if (value === null || value === undefined || value === false)
        return;
    if (key === 'className' || key === 'class') {
        element.setAttribute('class', joinClassNames(value));
        return;
    }
    if (key === 'style' && value && typeof value === 'object' && !Array.isArray(value)) {
        Object.entries(value).forEach(([styleName, styleValue]) => {
            if (styleValue === null || styleValue === undefined)
                return;
            element.style.setProperty(stylePropToKebabCase(styleName), String(styleValue));
        });
        return;
    }
    if (key.startsWith('on') && typeof value === 'function') {
        element.addEventListener(key.slice(2).toLowerCase(), value);
        return;
    }
    if (value === true) {
        element.setAttribute(key, '');
        return;
    }
    if (!key.startsWith('aria-') && !key.startsWith('data-') && key in element) {
        try {
            element[key] = value;
            return;
        }
        catch {
            // Falls through to setAttribute for read-only/native mismatches.
        }
    }
    element.setAttribute(key, String(value));
}
function Fragment(props = {}) {
    const fragment = document.createDocumentFragment();
    appendJsxChild(fragment, props.children ?? []);
    return fragment;
}
function h(tag, props = null, ...children) {
    const safeProps = (props && typeof props === 'object') ? props : {};
    const normalizedChildren = [
        ...(Array.isArray(safeProps.children) ? safeProps.children : [safeProps.children]),
        ...children
    ];
    if (typeof tag === 'function') {
        return tag({ ...safeProps, children: normalizedChildren });
    }
    const element = document.createElement(tag);
    Object.entries(safeProps).forEach(([key, value]) => setJsxProp(element, key, value));
    normalizedChildren.forEach(child => appendJsxChild(element, child));
    return element;
}
// Icon source resolver (assets + Ant Design via Iconify CDN)
// ============================================================================
function resolveIconSource(icon, color) {
    const raw = String(icon || '').trim();
    if (!raw)
        return { src: '', isAntd: false };
    // Ant Design icon shorthand:
    // - "antd:menu-outlined"
    // - "antd:setting-filled"
    if (raw.toLowerCase().startsWith('antd:')) {
        const iconName = raw.slice(5).trim();
        const encodedName = encodeURIComponent(iconName || 'question-circle-outlined');
        const encodedColor = encodeURIComponent(String(color || '').trim() || 'white');
        return {
            src: `https://api.iconify.design/ant-design/${encodedName}.svg?color=${encodedColor}`,
            isAntd: true
        };
    }
    return { src: raw, isAntd: false };
}
// Panel component
// ============================================================================
/**
 * Encapsulates one panel DOM node and its active state.
 */
class PanelComponent {
    constructor(element, index = 0) {
        this.element = element instanceof HTMLElement ? element : null;
        this.index = toSafeInt(index, 0);
        this.id = this.element?.id || `panel-${this.index}`;
    }
    setActive(active) {
        if (!this.element)
            return;
        const isActive = !!active;
        this.element.classList.toggle('is-active-panel', isActive);
        this.element.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        this.element.dataset.panelActive = isActive ? '1' : '0';
        applyInlineStyle(this.element, isActive ? panelStyles.active : panelStyles.inactive);
    }
}
const panelStyles = ComponentStyleSheet.create({
    active: {},
    inactive: {}
});
// Global loading helper component
// ============================================================================
class LoadingHelperComponent {
    constructor(options = {}) {
        const safe = (options && typeof options === 'object') ? options : {};
        this.overlayId = String(safe.overlayId || 'appLoadingOverlay').trim() || 'appLoadingOverlay';
        this.labelId = String(safe.labelId || 'appLoadingLabel').trim() || 'appLoadingLabel';
        this.defaultMessage = String(safe.defaultMessage || 'Loading...').trim() || 'Loading...';
        this.fallbackVisibleCount = 0;
        this.useLegacyOverlayApi = false;
        this.prefersReducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        this.ensureOverlay();
    }
    getOverlay() {
        const overlay = el(this.overlayId);
        return overlay instanceof HTMLElement ? overlay : null;
    }
    getLabel() {
        const label = el(this.labelId);
        return label instanceof HTMLElement ? label : null;
    }
    createOverlayElement() {
        const cardBaseStyle = this.prefersReducedMotion
            ? { ...loadingHelperStyles.loaderCard, ...loadingHelperStyles.loaderCardReducedMotion }
            : loadingHelperStyles.loaderCard;
        return (h("dialog", { id: this.overlayId, "aria-hidden": "true", style: loadingHelperStyles.overlay },
            h("div", { role: "status", "aria-live": "polite", "aria-atomic": "true", style: loadingHelperStyles.inner },
                h("div", { "aria-hidden": "true", style: loadingHelperStyles.loaderStack },
                    h("span", { style: { ...cardBaseStyle, ...loadingHelperStyles.loaderCardOne } }),
                    h("span", { style: { ...cardBaseStyle, ...loadingHelperStyles.loaderCardTwo } }),
                    h("span", { style: { ...cardBaseStyle, ...loadingHelperStyles.loaderCardThree } })),
                h("div", { id: this.labelId, style: loadingHelperStyles.label }, this.defaultMessage))));
    }
    ensureOverlay() {
        const existing = this.getOverlay();
        if (existing) {
            // Keep the legacy overlay wiring so existing app flows stay intact.
            this.useLegacyOverlayApi = true;
            return;
        }
        const overlay = this.createOverlayElement();
        overlay.dataset.loadingHelperOverlay = '1';
        document.body.appendChild(overlay);
        this.useLegacyOverlayApi = false;
    }
    showFallback(message) {
        const overlay = this.getOverlay();
        if (!overlay)
            return;
        this.fallbackVisibleCount += 1;
        this.setMessage(message);
        if (this.fallbackVisibleCount > 1)
            return;
        applyInlineStyle(overlay, loadingHelperStyles.overlayVisible);
        overlay.setAttribute('aria-hidden', 'false');
        overlay.setAttribute('open', '');
        document.body.classList.add('app-loading');
    }
    hideFallback(force = false) {
        const overlay = this.getOverlay();
        if (!overlay)
            return;
        if (force)
            this.fallbackVisibleCount = 0;
        else
            this.fallbackVisibleCount = Math.max(0, this.fallbackVisibleCount - 1);
        if (this.fallbackVisibleCount > 0)
            return;
        applyInlineStyle(overlay, loadingHelperStyles.overlayHidden);
        overlay.setAttribute('aria-hidden', 'true');
        overlay.removeAttribute('open');
        document.body.classList.remove('app-loading');
    }
    setMessage(message = this.defaultMessage) {
        const next = String(message || '').trim() || this.defaultMessage;
        if (this.useLegacyOverlayApi && typeof setAppLoadingLabel === 'function') {
            setAppLoadingLabel(next);
            return;
        }
        const label = this.getLabel();
        if (!label)
            return;
        label.textContent = next;
    }
    show(message = this.defaultMessage) {
        const next = String(message || '').trim() || this.defaultMessage;
        if (this.useLegacyOverlayApi && typeof setAppLoadingState === 'function') {
            setAppLoadingState(true, next);
            return;
        }
        this.showFallback(next);
    }
    hide() {
        if (this.useLegacyOverlayApi && typeof setAppLoadingState === 'function') {
            setAppLoadingState(false);
            return;
        }
        this.hideFallback(false);
    }
    forceHide() {
        if (this.useLegacyOverlayApi && typeof setAppLoadingState === 'function') {
            const overlay = this.getOverlay();
            const isVisible = !!overlay && overlay.classList.contains('is-visible');
            if (!isVisible)
                return;
            for (let i = 0; i < 200; i += 1) {
                setAppLoadingState(false);
                const stillVisible = !!overlay && overlay.classList.contains('is-visible');
                if (!stillVisible)
                    break;
            }
            return;
        }
        this.hideFallback(true);
    }
    async withTask(message, task) {
        this.show(message);
        try {
            return await Promise.resolve(task());
        }
        finally {
            this.hide();
        }
    }
}
function initializeLoadingHelperComponent(options = {}) {
    const helper = new LoadingHelperComponent(options);
    window.loadingHelper = helper;
    window.showGlobalLoading = (message) => helper.show(message);
    window.hideGlobalLoading = () => helper.hide();
    window.setGlobalLoadingMessage = (message) => helper.setMessage(message);
    return helper;
}
const loadingHelperStyles = ComponentStyleSheet.create({
    overlay: {
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        margin: 0,
        width: '100dvw',
        maxWidth: 'none',
        height: '100dvh',
        maxHeight: 'none',
        padding: 0,
        border: 'none',
        display: 'block',
        background: 'rgba(7, 12, 24, 0.56)',
        backdropFilter: 'blur(10px)',
        opacity: 0,
        pointerEvents: 'none',
        transition: 'opacity 0.22s ease'
    },
    overlayVisible: {
        opacity: 1,
        pointerEvents: 'auto'
    },
    overlayHidden: {
        opacity: 0,
        pointerEvents: 'none'
    },
    inner: {
        position: 'fixed',
        top: '50%',
        left: '50%',
        margin: 0,
        transform: 'translate(-50%, -50%)',
        minWidth: '176px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        padding: '16px 18px 14px',
        borderRadius: '18px',
        border: '1px solid rgba(70, 98, 146, 0.65)',
        background: 'linear-gradient(180deg, rgba(19, 29, 52, 0.95) 0%, rgba(14, 22, 42, 0.95) 100%)',
        boxShadow: '0 16px 34px rgba(2, 7, 18, 0.54)'
    },
    loaderStack: {
        position: 'relative',
        width: '124px',
        height: '132px',
        transform: 'translateY(-30px)'
    },
    loaderCard: {
        position: 'absolute',
        left: '25%',
        top: '25%',
        width: '76px',
        height: '104px',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'linear-gradient(165deg, #e85f82 8%, #c155ba 52%, #48b4ee 100%)',
        boxShadow: '0 10px 24px rgba(20, 17, 52, 0.44)',
        animation: 'app-loader-card-pulse 1.05s ease-in-out infinite'
    },
    loaderCardOne: {
        '--tx': '-30px',
        '--ty': '-26px',
        '--rot': '-15deg',
        transform: 'translate(var(--tx), var(--ty)) rotate(var(--rot))',
        zIndex: 3,
        animationDelay: '0s'
    },
    loaderCardTwo: {
        '--tx': '9px',
        '--ty': '-12px',
        '--rot': '14deg',
        transform: 'translate(var(--tx), var(--ty)) rotate(var(--rot))',
        zIndex: 2,
        animationDelay: '0.18s',
        filter: 'saturate(0.96)'
    },
    loaderCardThree: {
        '--tx': '-1px',
        '--ty': '22px',
        '--rot': '43deg',
        transform: 'translate(var(--tx), var(--ty)) rotate(var(--rot))',
        zIndex: 1,
        animationDelay: '0.36s',
        filter: 'saturate(0.92)'
    },
    loaderCardReducedMotion: {
        animation: 'none'
    },
    label: {
        marginTop: '-6px',
        textAlign: 'center',
        color: '#dbe7ff',
        fontWeight: 600,
        letterSpacing: '0.01em',
        fontSize: 'var(--font-size-small, 0.8rem)',
        lineHeight: 1.35
    }
});
/*
 * Default component pattern:
 * Keep local style definitions in `ComponentStyleSheet.create(...)`.
 * Extend these entries instead of sprinkling ad-hoc inline style literals.
 */
// App button component
// ============================================================================
function toCssSize(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value))
        return `${value}px`;
    const text = String(value ?? '').trim();
    return text || fallback;
}
function normalizeHitSlopInsets(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        const safe = Math.max(0, value);
        return { top: safe, right: safe, bottom: safe, left: safe };
    }
    const raw = (value && typeof value === 'object') ? value : {};
    return {
        top: Math.max(0, Number(raw.top || 0)),
        right: Math.max(0, Number(raw.right || 0)),
        bottom: Math.max(0, Number(raw.bottom || 0)),
        left: Math.max(0, Number(raw.left || 0))
    };
}
function triggerPressHaptic() {
    try {
        if (typeof navigator.vibrate === 'function')
            navigator.vibrate(16);
    }
    catch {
        // Optional browser API.
    }
}
function isSidebarToggleViewport() {
    if (document.body.classList.contains('sidebar-hidden'))
        return false;
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    const phoneLikeViewport = window.innerWidth <= 768;
    const tabletPortraitViewport = window.innerWidth <= 1024 && portrait;
    return phoneLikeViewport || tabletPortraitViewport;
}
function hasDefinedSize(value) {
    if (typeof value === 'number')
        return Number.isFinite(value);
    if (typeof value === 'string')
        return value.trim().length > 0;
    return false;
}
function createAppButton(options) {
    const safe = (options && typeof options === 'object') ? options : null;
    if (!safe)
        throw new Error('createAppButton requires a valid options object.');
    const onPress = typeof safe.onPress === 'function'
        ? safe.onPress
        : typeof safe.onClick === 'function'
            ? ((event) => safe.onClick?.(event))
            : null;
    if (!onPress)
        throw new Error('createAppButton requires an onPress or onClick function.');
    const resolvedIcon = resolveIconSource(safe.icon, safe.iconColor);
    if (!resolvedIcon.src)
        throw new Error('createAppButton requires an icon path.');
    const iconSize = toCssSize(safe.iconSize, '18px');
    const variant = safe.variant === 'sidebarToggle' ? 'sidebarToggle' : 'default';
    const isSidebarToggle = variant === 'sidebarToggle';
    const isRect = safe.rect === true;
    if (!isRect && (!hasDefinedSize(safe.width) || !hasDefinedSize(safe.height))) {
        throw new Error('createAppButton requires width and height when rect is not true.');
    }
    const disabled = !!safe.disabled;
    const loading = !!safe.loading;
    const isBlocked = disabled || loading;
    const visualDisabled = !!safe.visualDisabled;
    const appearanceDisabled = visualDisabled || isBlocked;
    const baseScale = appearanceDisabled ? 0.95 : 1;
    const pressedScale = 0.97;
    const backgroundColor = appearanceDisabled
        ? String(safe.backgroundColorDisabled || '#777777')
        : String(safe.backgroundColor || '#273655');
    const width = toCssSize(safe.width, isRect ? '40px' : '');
    const height = toCssSize(safe.height, isRect ? '40px' : '');
    const button = (h("button", { type: "button", id: safe.id ? String(safe.id).trim() : undefined, title: safe.title ? String(safe.title) : undefined, "aria-label": safe.ariaLabel ? String(safe.ariaLabel) : undefined, "aria-disabled": isBlocked ? 'true' : 'false', "aria-busy": loading ? 'true' : 'false', disabled: isBlocked, style: {
            ...appButtonStyles.base,
            ...(isSidebarToggle ? appButtonStyles.sidebarToggleVariant : appButtonStyles.defaultVariant),
            width,
            height,
            backgroundColor,
            transform: `scale(${baseScale})`
        } },
        h("img", { src: resolvedIcon.src, alt: "", "aria-hidden": "true", style: {
                ...appButtonStyles.icon,
                ...(resolvedIcon.isAntd ? appButtonStyles.antdIcon : appButtonStyles.localIcon),
                width: iconSize,
                height: iconSize
            } })));
    applyInlineStyle(button, safe.style);
    if (isSidebarToggle) {
        const syncSidebarToggleVisibility = () => {
            button.style.display = isSidebarToggleViewport() ? 'inline-flex' : 'none';
        };
        syncSidebarToggleVisibility();
        window.addEventListener('resize', syncSidebarToggleVisibility);
        window.addEventListener('orientationchange', syncSidebarToggleVisibility);
    }
    const insets = normalizeHitSlopInsets(safe.hitSlop);
    if (insets.top || insets.right || insets.bottom || insets.left) {
        button.style.backgroundClip = 'padding-box';
        button.style.borderStyle = 'solid';
        button.style.borderColor = 'transparent';
        button.style.borderTopWidth = `${insets.top}px`;
        button.style.borderRightWidth = `${insets.right}px`;
        button.style.borderBottomWidth = `${insets.bottom}px`;
        button.style.borderLeftWidth = `${insets.left}px`;
        button.style.marginTop = `${-insets.top}px`;
        button.style.marginRight = `${-insets.right}px`;
        button.style.marginBottom = `${-insets.bottom}px`;
        button.style.marginLeft = `${-insets.left}px`;
    }
    let pressActive = false;
    let massageIntervalRef = null;
    const stopMassage = () => {
        if (massageIntervalRef === null)
            return;
        window.clearInterval(massageIntervalRef);
        massageIntervalRef = null;
    };
    const setPressedVisualState = (pressed) => {
        const base = appearanceDisabled ? 0.95 : 1;
        button.style.transform = `scale(${pressed ? base * pressedScale : base})`;
        button.style.opacity = pressed ? '0.6' : '1';
    };
    const handlePressIn = (event) => {
        if (isBlocked || pressActive) {
            safe.onPressIn?.(event);
            return;
        }
        pressActive = true;
        setPressedVisualState(true);
        triggerPressHaptic();
        if (!safe.disableHapticOnPressOut) {
            massageIntervalRef = window.setInterval(triggerPressHaptic, 250);
        }
        safe.onPressIn?.(event);
    };
    const handlePressOut = (event) => {
        const wasActive = pressActive;
        if (pressActive) {
            setPressedVisualState(false);
            pressActive = false;
        }
        if (wasActive && !safe.disableHapticOnPressOut)
            triggerPressHaptic();
        stopMassage();
        safe.onPressOut?.(event);
    };
    const isPressKey = (event) => event.key === 'Enter' || event.key === ' ';
    button.addEventListener('click', event => {
        if (isBlocked)
            return;
        onPress(event);
    });
    button.addEventListener('pointerdown', handlePressIn);
    button.addEventListener('pointerup', handlePressOut);
    button.addEventListener('pointercancel', handlePressOut);
    button.addEventListener('pointerleave', handlePressOut);
    button.addEventListener('blur', handlePressOut);
    button.addEventListener('keydown', event => {
        if (!isPressKey(event))
            return;
        handlePressIn(event);
    });
    button.addEventListener('keyup', event => {
        if (!isPressKey(event))
            return;
        handlePressOut(event);
    });
    return button;
}
function createHeaderButton(options) {
    return createAppButton(options);
}
const appButtonStyles = ComponentStyleSheet.create({
    base: {
        border: 'none',
        borderRadius: 'var(--radius)',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'manipulation',
        cursor: 'pointer',
        minWidth: '40px',
        opacity: 1,
        transition: 'transform 140ms ease, opacity 140ms ease, background-color 140ms ease'
    },
    defaultVariant: {
        display: 'inline-flex',
        padding: '8px'
    },
    sidebarToggleVariant: {
        display: 'none',
        padding: 0,
        transformOrigin: 'center'
    },
    icon: {
        width: '18px',
        height: '18px'
    },
    localIcon: {
        objectFit: 'contain',
        display: 'block',
        pointerEvents: 'none',
        filter: 'brightness(0) invert(1)'
    },
    antdIcon: {
        objectFit: 'contain',
        display: 'block',
        pointerEvents: 'none',
        filter: 'none'
    }
});
// Header component
// ============================================================================
function createAppHeader(options) {
    const safe = (options && typeof options === 'object') ? options : null;
    if (!safe) {
        throw new Error('createAppHeader requires a valid options object.');
    }
    const title = String(safe.title || '').trim();
    if (!title) {
        throw new Error('createAppHeader requires a title.');
    }
    const leftButtons = Array.isArray(safe.leftButtons) ? safe.leftButtons : [];
    const rightButtons = Array.isArray(safe.rightButtons) ? safe.rightButtons : [];
    return (h("div", { id: safe.id ? String(safe.id).trim() : undefined, style: headerStyles.root },
        h("div", { style: { ...headerStyles.side, ...headerStyles.sideLeft } }, leftButtons.map(buttonOptions => createAppButton(buttonOptions))),
        h("h2", { style: headerStyles.title }, title),
        h("div", { style: { ...headerStyles.side, ...headerStyles.sideRight } }, rightButtons.map(buttonOptions => createAppButton(buttonOptions)))));
}
const headerStyles = ComponentStyleSheet.create({
    root: {
        position: 'relative',
        margin: 0,
        width: '100%',
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: 'var(--space-2) var(--space-3)',
        border: '1px solid #30476f',
        borderRadius: '16px',
        background: 'rgba(10, 16, 30, 0.899)',
        boxShadow: '0 0px 20px var(--accent)',
        isolation: 'isolate',
        transform: 'translateZ(0)',
        minHeight: '56px'
    },
    side: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minWidth: 0
    },
    sideLeft: {
        justifyContent: 'flex-start'
    },
    sideRight: {
        justifyContent: 'flex-end'
    },
    title: {
        margin: 0,
        justifySelf: 'center',
        textAlign: 'center',
        fontSize: 'var(--font-size-title)',
        lineHeight: 1.2,
        fontWeight: 700,
        pointerEvents: 'none',
        maxWidth: '100%'
    }
});
// Panel view manager
// ============================================================================
/**
 * Central panel-navigation component for the current vanilla app shell.
 */
class PanelViewManager {
    constructor(options = {}) {
        const opts = (options && typeof options === 'object') ? options : {};
        this.trackId = String(opts.trackId || 'track').trim() || 'track';
        this.exchangeViewIndex = toSafeInt(opts.exchangeViewIndex, 4);
        this.hideSidebarViewIndex = toSafeInt(opts.hideSidebarViewIndex, 3);
        this.currentView = 0;
        this.track = null;
        this.panels = [];
    }
    ensurePanels() {
        const track = el(this.trackId);
        this.track = track instanceof HTMLElement ? track : null;
        if (!this.track) {
            this.panels = [];
            return;
        }
        const panelElements = Array.from(this.track.querySelectorAll(':scope > .panel'));
        this.panels = panelElements.map((panelElement, index) => {
            return new PanelComponent(panelElement instanceof HTMLElement ? panelElement : null, index);
        });
    }
    getPanelCount() {
        this.ensurePanels();
        return Math.max(1, this.panels.length || 1);
    }
    clampStep(step) {
        const safeStep = toSafeInt(step, 0);
        const maxIndex = this.getPanelCount() - 1;
        return Math.max(0, Math.min(maxIndex, safeStep));
    }
    syncSidebarHiddenState(step = this.currentView) {
        const studySection = el('studySessionSection');
        const hideForStudy = step === 2 && !!studySection && !studySection.classList.contains('hidden');
        const hideSidebar = step === this.hideSidebarViewIndex || hideForStudy;
        document.body.classList.toggle('sidebar-hidden', hideSidebar);
        if (hideSidebar)
            document.body.classList.remove('sidebar-open');
    }
    updateTrackTransform(step = this.currentView) {
        if (!this.track)
            return;
        const panelCount = Math.max(1, this.panels.length || 1);
        this.track.style.transform = `translateX(${-100 * step / panelCount}%)`;
    }
    updatePanelActiveStates(step = this.currentView) {
        this.panels.forEach((panel, index) => {
            panel.setActive(index === step);
        });
    }
    setView(step = 0) {
        this.ensurePanels();
        if (!this.track)
            return this.currentView;
        const previousStep = toSafeInt(this.currentView, 0);
        const safeStep = this.clampStep(step);
        const shouldJumpWithoutSlide = safeStep === this.exchangeViewIndex || previousStep === this.exchangeViewIndex;
        document.body.classList.toggle('exchange-only-view', safeStep === this.exchangeViewIndex);
        if (shouldJumpWithoutSlide)
            this.track.classList.add('view-jump');
        this.currentView = safeStep;
        this.updateTrackTransform(safeStep);
        this.updatePanelActiveStates(safeStep);
        if (shouldJumpWithoutSlide) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this.track?.classList.remove('view-jump');
                });
            });
        }
        if (safeStep !== this.hideSidebarViewIndex) {
            document.querySelector('#editorPanel .editor-shell')?.classList.remove('sidebar-open');
        }
        if (safeStep !== this.exchangeViewIndex) {
            document.body.classList.remove('content-exchange-open');
        }
        this.syncSidebarHiddenState(safeStep);
        return safeStep;
    }
}
function createPanelViewManager(options = {}) {
    return new PanelViewManager(options);
}
window.createPanelViewManager = createPanelViewManager;
// App layout-level frontend bootstrap (TS source)
// ============================================================================
const FRONTEND_TS_ROOT_ID = 'tsxAppRoot';
const LEGACY_STYLESHEET_ID = 'legacyStylesheet';
function isComponentsOnlyModeEnabled() {
    const runtimeFlag = window.__UI_COMPONENTS_ONLY__;
    if (typeof runtimeFlag === 'boolean')
        return runtimeFlag;
    return false;
}
function disableLegacyStylesheet() {
    const legacySheet = document.getElementById(LEGACY_STYLESHEET_ID);
    if (!(legacySheet instanceof HTMLLinkElement))
        return;
    legacySheet.disabled = true;
}
function ensureFrontendTsRoot() {
    const existing = document.getElementById(FRONTEND_TS_ROOT_ID);
    if (existing instanceof HTMLDivElement)
        return existing;
    const root = document.createElement('div');
    root.id = FRONTEND_TS_ROOT_ID;
    document.body.appendChild(root);
    return root;
}
function createMigrationSidebar() {
    const listItems = [
        'Header',
        'Sidebar Navigation',
        'Subjects List',
        'Topic Panel',
        'Card Overview',
        'Study Session',
    ];
    return (h("aside", { style: appWorkspaceStyles.sidebar },
        h("div", { style: appWorkspaceStyles.sidebarTitle }, "Flashcards TS"),
        h("div", { style: appWorkspaceStyles.sidebarSubtitle }, "Migration Workspace"),
        h("ul", { style: appWorkspaceStyles.sidebarList }, listItems.map(item => (h("li", { style: appWorkspaceStyles.sidebarListItem }, item))))));
}
function createMigrationMain() {
    const header = createAppHeader({
        id: 'tsxWorkspaceHeader',
        title: 'Frontend Components Workspace',
        leftButtons: [
            {
                id: 'tsxSidebarToggle',
                icon: 'antd:menu-outlined',
                rect: true,
                ariaLabel: 'Show migration outline',
                title: 'Show migration outline',
                onPress: () => {
                    const root = document.getElementById(FRONTEND_TS_ROOT_ID);
                    if (!(root instanceof HTMLElement))
                        return;
                    root.classList.toggle('tsx-sidebar-hidden');
                }
            }
        ],
        rightButtons: [
            {
                id: 'tsxLoadingToggle',
                icon: 'antd:loading',
                rect: true,
                ariaLabel: 'Toggle loading helper preview',
                title: 'Toggle loading helper preview',
                onPress: () => {
                    const overlay = el('appLoadingOverlay');
                    const isVisible = overlay instanceof HTMLElement && overlay.classList.contains('is-visible');
                    if (isVisible)
                        window.hideGlobalLoading?.();
                    else
                        window.showGlobalLoading?.('Migrating UI components...');
                }
            }
        ]
    });
    const body = (h("div", { style: appWorkspaceStyles.mainBody },
        h("section", { style: appWorkspaceStyles.infoCard },
            h("h3", { style: appWorkspaceStyles.infoTitle }, "Legacy UI Hidden"),
            h("p", { style: appWorkspaceStyles.infoText }, "Du siehst jetzt nur noch die neue Frontend-TS-Struktur. Migriere ab jetzt Panel fuer Panel in diese Shell.")),
        h("section", { style: appWorkspaceStyles.infoCard },
            h("h3", { style: appWorkspaceStyles.infoTitle }, "Next Steps"),
            h("p", { style: appWorkspaceStyles.infoText }, "1) Sidebar als eigene Komponente fertigstellen. 2) Home/Topics migrieren. 3) Study Session migrieren."))));
    return (h("main", { style: appWorkspaceStyles.main },
        header,
        body));
}
function mountComponentsWorkspace() {
    const root = ensureFrontendTsRoot();
    const shell = (h("div", { style: appWorkspaceStyles.shell },
        createMigrationSidebar(),
        createMigrationMain()));
    root.replaceChildren(shell);
}
function initializePanelComponentLayer() {
    if (!isComponentsOnlyModeEnabled())
        return;
    document.body.dataset.uiStructureMode = 'components';
    document.body.dataset.uiComponentsOnly = '1';
    disableLegacyStylesheet();
    mountComponentsWorkspace();
    initializeLoadingHelperComponent({
        overlayId: 'appLoadingOverlay',
        labelId: 'appLoadingLabel',
        defaultMessage: 'Loading...'
    });
}
window.setUiStructureMode = () => {
    document.body.dataset.uiStructureMode = 'components';
    document.body.dataset.uiComponentsOnly = '1';
    mountComponentsWorkspace();
};
const appWorkspaceStyles = ComponentStyleSheet.create({
    shell: {
        minHeight: '100dvh',
        display: 'grid',
        gridTemplateColumns: 'clamp(220px, 24vw, 280px) minmax(0, 1fr)',
        gap: 'var(--space-4)',
        padding: 'var(--space-4)',
        boxSizing: 'border-box',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'Inter, Segoe UI, Roboto, system-ui, sans-serif'
    },
    sidebar: {
        border: '1px solid #30476f',
        borderRadius: 'var(--radius)',
        background: 'rgba(10, 16, 30, 0.92)',
        padding: 'var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        boxShadow: '0 0px 20px var(--accent-glow)'
    },
    sidebarTitle: {
        fontSize: 'var(--font-size-title)',
        fontWeight: 700
    },
    sidebarSubtitle: {
        fontSize: 'var(--font-size-small)',
        color: 'var(--muted)'
    },
    sidebarList: {
        listStyle: 'none',
        margin: 'var(--space-2) 0 0 0',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)'
    },
    sidebarListItem: {
        padding: '10px 12px',
        borderRadius: '10px',
        border: '1px solid rgba(59, 84, 126, 0.8)',
        background: 'rgba(18, 28, 48, 0.86)',
        fontSize: 'var(--font-size-small)'
    },
    main: {
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)'
    },
    mainBody: {
        display: 'grid',
        gap: 'var(--space-3)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'
    },
    infoCard: {
        border: '1px solid #30476f',
        borderRadius: 'var(--radius)',
        background: 'rgba(10, 16, 30, 0.9)',
        padding: 'var(--space-3)',
        boxShadow: '0 0px 20px rgba(7, 16, 34, 0.35)'
    },
    infoTitle: {
        margin: 0,
        fontSize: '1rem',
        fontWeight: 700
    },
    infoText: {
        margin: 'var(--space-2) 0 0',
        color: 'var(--text)',
        lineHeight: 1.5,
        fontSize: 'var(--font-size-small)'
    }
});
// App entry for frontend TS component layer
// ============================================================================
initializePanelComponentLayer();
