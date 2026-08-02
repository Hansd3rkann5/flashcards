// App Navigation + Layout State
// ============================================================================
/**
* @function showDialog
 * @description Opens a dialog and applies shared modal behavior.
 */

function showDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

/**
 * @function closeDialog
 * @description Closes a dialog and clears modal state.
 */

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

let currentView = 0;
const panelViewManager = createPanelViewManager({
  trackId: 'track',
  exchangeViewIndex: 4,
  hideSidebarViewIndex: 3
});

/**
 * @function syncSidebarHiddenState
 * @description Synchronizes sidebar hidden state.
 */

function syncSidebarHiddenState(step = currentView) {
  panelViewManager.syncSidebarHiddenState(step);
}

/**
 * @function setView
 * @description Sets the active app panel view.
 */

function setView(step = 0) {
  currentView = panelViewManager.setView(step);
}

/**
 * @function getCurrentView
 * @description Returns the currently active app panel index.
 */

function getCurrentView() {
  return currentView;
}

setView(currentView);

// ============================================================================
