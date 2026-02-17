// Bootstrap + Event Wiring
// ============================================================================
/**
* @function boot
 * @description Initializes app state, wires UI events, and loads initial data for the first screen.
 */

async function boot() {
  void registerOfflineServiceWorker();
  let backendReachable = false;
  try {
    backendReachable = await openDB();
    await openCardBankDB();
    await preloadTopicDirectory({ force: true });
  } catch (err) {
    alert(err.message || 'Unable to connect to Supabase backend.');
    return;
  }
  if (!backendReachable) {
    console.info('Backend not reachable. Running with offline cache and queued local changes.');
  }
  wireNoZoomGuards();
  wireSwipe();
  wireHapticFeedback();
  wireSidebarSwipeGesture();
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!appLoadingDebugPinned) return;
    e.preventDefault();
    e.stopPropagation();
    closeDebugLoadingOverlay();
  });
  window.addEventListener('online', () => { void openDB(); });

  el('homeBtn').onclick = () => {
    setView(0);
    document.body.classList.remove('sidebar-open');
    void refreshDailyReviewHomePanel({ useExisting: false });
  };
  el('settingsBtn').onclick = () => document.getElementById('settingsDialog').showModal();
  const closeSettingsBtn = el('closeSettingsBtn');
  if (closeSettingsBtn) closeSettingsBtn.onclick = () => closeDialog(el('settingsDialog'));
  const quickAddSubjectBtn = el('quickAddSubject');
  if (quickAddSubjectBtn) quickAddSubjectBtn.onclick = openSubjectDialog;
  el('addSubjectBtn').onclick = openSubjectDialog;
  const quickExportBtn = el('quickExport');
  if (quickExportBtn) quickExportBtn.onclick = exportJSON;
  const exportJsonBtn = el('exportJsonBtn');
  if (exportJsonBtn) exportJsonBtn.onclick = exportJSON;
  const exportCsvBtn = el('exportCsvBtn');
  if (exportCsvBtn) exportCsvBtn.onclick = exportCSV;
  const importInput = el('importInput');
  if (importInput) {
    importInput.addEventListener('change', e => {
      const file = e.target?.files?.[0];
      if (file) importJSON(file);
      importInput.value = '';
    });
  }
  const openProgressCheckBtn = el('openProgressCheckBtn');
  if (openProgressCheckBtn) openProgressCheckBtn.onclick = openProgressCheckDialog;
  const openProgressCheckFromSettingsBtn = el('openProgressCheckFromSettingsBtn');
  if (openProgressCheckFromSettingsBtn) {
    openProgressCheckFromSettingsBtn.onclick = async () => {
      const settingsDialog = el('settingsDialog');
      if (settingsDialog?.open) closeDialog(settingsDialog);
      await openProgressCheckDialog();
    };
  }
  const startBtn = el('startSessionBtn');
  if (startBtn) startBtn.onclick = startSession;
  const openSessionFilterBtn = el('openSessionFilterBtn');
  if (openSessionFilterBtn) {
    openSessionFilterBtn.onclick = () => {
      fillSessionFilterDialogFromState();
      showDialog(el('sessionFilterDialog'));
    };
  }

  const sessionFilterDialog = el('sessionFilterDialog');
  if (sessionFilterDialog) {
    sessionFilterDialog.addEventListener('click', e => {
      if (e.target === sessionFilterDialog) closeDialog(sessionFilterDialog);
    });
  }
  const sessionFilterAll = el('sessionFilterAll');
  const sessionFilterCorrect = el('sessionFilterCorrect');
  const sessionFilterWrong = el('sessionFilterWrong');
  const sessionFilterPartial = el('sessionFilterPartial');
  const sessionFilterNotAnswered = el('sessionFilterNotAnswered');
  const sessionFilterNotAnsweredYet = el('sessionFilterNotAnsweredYet');
  if (sessionFilterAll) {
    sessionFilterAll.addEventListener('change', () => {
      if (sessionFilterAll.checked) {
        if (sessionFilterCorrect) sessionFilterCorrect.checked = false;
        if (sessionFilterWrong) sessionFilterWrong.checked = false;
        if (sessionFilterPartial) sessionFilterPartial.checked = false;
        if (sessionFilterNotAnswered) sessionFilterNotAnswered.checked = false;
        if (sessionFilterNotAnsweredYet) sessionFilterNotAnsweredYet.checked = false;
      }
      syncSessionFilterDialogControls();
    });
  }
  [sessionFilterCorrect, sessionFilterWrong, sessionFilterPartial, sessionFilterNotAnswered, sessionFilterNotAnsweredYet].forEach(input => {
    if (!input) return;
    input.addEventListener('change', () => {
      if (input.checked && sessionFilterAll) sessionFilterAll.checked = false;
      syncSessionFilterDialogControls();
    });
  });
  const closeSessionFilterBtn = el('closeSessionFilterBtn');
  if (closeSessionFilterBtn) {
    closeSessionFilterBtn.onclick = () => closeDialog(el('sessionFilterDialog'));
  }
  const saveSessionFilterBtn = el('saveSessionFilterBtn');
  if (saveSessionFilterBtn) {
    saveSessionFilterBtn.onclick = async () => {
      const next = pullSessionFiltersFromDialog();
      await setSessionFilterState(next, { refresh: true });
      closeDialog(el('sessionFilterDialog'));
    };
  }

  const sessionCompleteDialog = el('sessionCompleteDialog');
  if (sessionCompleteDialog) {
    sessionCompleteDialog.addEventListener('click', e => {
      if (e.target === sessionCompleteDialog) dismissSessionCompleteDialog();
    });
    sessionCompleteDialog.addEventListener('close', () => {
      if (sessionCompleteConfettiEmitter && typeof sessionCompleteConfettiEmitter.reset === 'function') {
        sessionCompleteConfettiEmitter.reset();
      }
    });
    sessionCompleteDialog.addEventListener('cancel', e => {
      e.preventDefault();
      dismissSessionCompleteDialog();
    });
  }
  const closeSessionCompleteBtn = el('closeSessionCompleteBtn');
  if (closeSessionCompleteBtn) {
    closeSessionCompleteBtn.onclick = () => dismissSessionCompleteDialog();
  }
  const sessionRepeatMinus = el('sessionRepeatMinus');
  if (sessionRepeatMinus) {
    sessionRepeatMinus.onclick = () => {
      if (sessionRepeatState.remaining <= 0) return;
      sessionRepeatState.size = Math.max(1, sessionRepeatState.size - 1);
      updateSessionRepeatCounter();
    };
  }
  const sessionRepeatPlus = el('sessionRepeatPlus');
  if (sessionRepeatPlus) {
    sessionRepeatPlus.onclick = () => {
      if (sessionRepeatState.remaining <= 0) return;
      sessionRepeatState.size = Math.min(sessionRepeatState.remaining, sessionRepeatState.size + 1);
      updateSessionRepeatCounter();
    };
  }
  const startAnotherSessionBtn = el('startAnotherSessionBtn');
  if (startAnotherSessionBtn) {
    startAnotherSessionBtn.onclick = async () => {
      if (sessionRepeatState.remaining <= 0) {
        dismissSessionCompleteDialog();
        return;
      }
      const forcedSize = Math.min(Math.max(sessionRepeatState.size, 1), sessionRepeatState.remaining);
      closeDialog(el('sessionCompleteDialog'));
      await startSession({
        topicIds: [...sessionRepeatState.topicIds],
        cardIds: [...sessionRepeatState.cardIds],
        filters: { ...sessionRepeatState.filters },
        forcedSize,
        reviewMode: sessionRepeatState.mode === 'daily-review'
      });
    };
  }

  const startDailyReviewBtn = el('startDailyReviewBtn');
  if (startDailyReviewBtn) startDailyReviewBtn.onclick = startDailyReviewFromHomePanel;
  const toggleDailyReviewAnalyticsBtn = el('toggleDailyReviewAnalyticsBtn');
  if (toggleDailyReviewAnalyticsBtn) {
    toggleDailyReviewAnalyticsBtn.onclick = toggleDailyReviewAnalytics;
    updateDailyReviewAnalyticsVisibility();
  }
  const debugLoaderBtn = el('debugLoaderBtn');
  if (debugLoaderBtn) debugLoaderBtn.onclick = openDebugLoadingOverlay;
  const dailyReviewFilterIds = ['dailyReviewFilterGreen', 'dailyReviewFilterYellow', 'dailyReviewFilterRed'];
  dailyReviewFilterIds.forEach(filterId => {
    const input = el(filterId);
    if (!input) return;
    input.addEventListener('change', () => {
      dailyReviewState.statusFilter = pullDailyReviewStatusFilterFromControls();
      syncDailyReviewDateKeysFromStatus();
      renderDailyReviewDateSlider();
      renderDailyReviewFilterSummary();
      renderDailyReviewTopicList();
    });
  });
  const dailyReviewDateStart = el('dailyReviewDateStart');
  const dailyReviewDateEnd = el('dailyReviewDateEnd');
  const commitDailyReviewDateFromActiveHandle = () => {
    const sliderWrap = el('dailyReviewDateSliderWrap');
    if (!sliderWrap) return;
    const isStartActive = sliderWrap.classList.contains('active-start');
    const isEndActive = sliderWrap.classList.contains('active-end');
    if (!isStartActive && !isEndActive) return;
    applyDailyReviewDateRangeFromControls(isEndActive ? 'end' : 'start');
    setDailyReviewActiveRangeHandle('');
  };
  if (dailyReviewDateStart) {
    const commitStart = () => applyDailyReviewDateRangeFromControls('start');
    const activateStart = () => setDailyReviewActiveRangeHandle('start');
    dailyReviewDateStart.addEventListener('pointerdown', activateStart);
    dailyReviewDateStart.addEventListener('mousedown', activateStart);
    dailyReviewDateStart.addEventListener('touchstart', activateStart, { passive: true });
    dailyReviewDateStart.addEventListener('focus', activateStart);
    dailyReviewDateStart.addEventListener('input', () => applyDailyReviewDateRangeFromControls('start', { preview: true }));
    dailyReviewDateStart.addEventListener('change', commitStart);
    dailyReviewDateStart.addEventListener('mouseup', commitStart);
    dailyReviewDateStart.addEventListener('touchend', commitStart);
    dailyReviewDateStart.addEventListener('blur', commitStart);
  }
  if (dailyReviewDateEnd) {
    const commitEnd = () => applyDailyReviewDateRangeFromControls('end');
    const activateEnd = () => setDailyReviewActiveRangeHandle('end');
    dailyReviewDateEnd.addEventListener('pointerdown', activateEnd);
    dailyReviewDateEnd.addEventListener('mousedown', activateEnd);
    dailyReviewDateEnd.addEventListener('touchstart', activateEnd, { passive: true });
    dailyReviewDateEnd.addEventListener('focus', activateEnd);
    dailyReviewDateEnd.addEventListener('input', () => applyDailyReviewDateRangeFromControls('end', { preview: true }));
    dailyReviewDateEnd.addEventListener('change', commitEnd);
    dailyReviewDateEnd.addEventListener('mouseup', commitEnd);
    dailyReviewDateEnd.addEventListener('touchend', commitEnd);
    dailyReviewDateEnd.addEventListener('blur', commitEnd);
  }
  document.addEventListener('pointerup', commitDailyReviewDateFromActiveHandle);
  document.addEventListener('pointercancel', commitDailyReviewDateFromActiveHandle);
  const dailyReviewMinus = el('dailyReviewMinus');
  if (dailyReviewMinus) {
    dailyReviewMinus.onclick = () => {
      const selectedCount = getDailyReviewSelectedCardIds().length;
      if (selectedCount <= 0) return;
      dailyReviewState.size = Math.max(1, dailyReviewState.size - 1);
      updateDailyReviewSizeCounter();
    };
  }
  const dailyReviewPlus = el('dailyReviewPlus');
  if (dailyReviewPlus) {
    dailyReviewPlus.onclick = () => {
      const selectedCount = getDailyReviewSelectedCardIds().length;
      if (selectedCount <= 0) return;
      dailyReviewState.size = Math.min(selectedCount, dailyReviewState.size + 1);
      updateDailyReviewSizeCounter();
    };
  }
  renderSessionFilterSummary();

  el('backToTopicsBtn').onclick = () => {
    setDeckSelectionMode(false);
    setView(1);
    // Render immediately from local subject cache; refreshes run in background.
    void loadTopics({ preferCached: true, uiBlocking: false });
    if (selectedSubject) void refreshTopicSessionMeta(currentSubjectTopics);
  };
  el('backToTopicsBtnSession').onclick = () => {
    closeStudyImageLightbox();
    setDeckSelectionMode(false);
    session.active = false;
    el('cardsOverviewSection').classList.remove('hidden');
    el('studySessionSection')?.classList.add('hidden');
    renderSessionPills();
    if (selectedSubject) refreshTopicSessionMeta();
    const returnToHome = session.mode === 'daily-review';
    setView(returnToHome ? 0 : 1);
    if (returnToHome) void refreshDailyReviewHomePanel({ useExisting: false });
  };
  el('backToDeckBtn').onclick = () => setView(2);
  const flashcardEl = el('flashcard');
  if (flashcardEl) {
    const canFlipSessionFlashcard = (eventTarget = null, opts = {}) => {
      const options = opts && typeof opts === 'object' ? opts : {};
      const allowButtonTarget = !!options.allowButtonTarget;
      if (!session.active || !isStudySessionVisible()) return false;
      if (document.body.classList.contains('session-image-open')) return false;
      if (document.querySelector('dialog[open]')) return false;
      if (Date.now() < suppressFlashcardTapUntil) return false;
      if (flashcardEl.classList.contains('swiping')) return false;
      if (flashcardEl.dataset.type === 'mcq') return false;
      if (hasActiveTextSelection()) return false;
      const target = eventTarget instanceof Element ? eventTarget : null;
      if (target && target.closest('.card-edit-btn, input, textarea, select, [contenteditable="true"]')) {
        return false;
      }
      if (!allowButtonTarget && target && target.closest('button')) return false;
      return true;
    };
    const flipSessionFlashcard = () => {
      flashcardEl.classList.toggle('flipped');
    };

    flashcardEl.onclick = e => {
      if (!canFlipSessionFlashcard(e.target)) return;
      flipSessionFlashcard();
    };

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeStudyImageLightbox();
      const target = e.target instanceof Element ? e.target : null;
      const editingTarget = target && target.closest('input, textarea, select, [contenteditable="true"]');
      const isSessionShortcutContext = (
        !editingTarget
        && !hasActiveTextSelection()
        && session.active
        && isStudySessionVisible()
        && !document.body.classList.contains('session-image-open')
        && !document.querySelector('dialog[open]')
      );
      const isMcqSessionCard = isSessionShortcutContext && flashcardEl.dataset.type === 'mcq';

      if (
        isMcqSessionCard &&
        !e.repeat &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const isEnter = (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') && !e.shiftKey;
        if (isEnter) {
          const { checkBtn } = getActiveSessionMcqControls();
          if (checkBtn) {
            e.preventDefault();
            checkBtn.click();
            return;
          }
        }
        if (!e.shiftKey) {
          let optionNumber = 0;
          if (/^Digit[1-9]$/.test(e.code)) optionNumber = Number(e.code.slice(5));
          else if (/^Numpad[1-9]$/.test(e.code)) optionNumber = Number(e.code.slice(6));
          else if (/^[1-9]$/.test(e.key)) optionNumber = Number(e.key);
          if (optionNumber > 0) {
            const { optionButtons, checkBtn } = getActiveSessionMcqControls();
            const checkMode = String(checkBtn?.dataset?.mode || checkBtn?.textContent || '').trim().toLowerCase();
            if (checkMode.startsWith('check')) {
              const optionBtn = optionButtons[optionNumber - 1] || null;
              if (optionBtn) {
                e.preventDefault();
                optionBtn.click();
                return;
              }
            }
          }
        }
      }

      const gradeByCode = {
        Digit1: 'correct',
        Numpad1: 'correct',
        Digit2: 'partial',
        Numpad2: 'partial',
        Digit3: 'wrong',
        Numpad3: 'wrong'
      };
      const gradeFromCode = gradeByCode[e.code] || null;
      const gradeFromKey = e.key === '1' ? 'correct' : e.key === '2' ? 'partial' : e.key === '3' ? 'wrong' : null;
      const gradeResult = gradeFromCode || gradeFromKey;
      if (
        gradeResult &&
        !e.repeat &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        isSessionShortcutContext &&
        !isMcqSessionCard
      ) {
        e.preventDefault();
        gradeCard(gradeResult);
        return;
      }
      const isShiftBackspace = (e.code === 'Backspace' || e.key === 'Backspace')
        && e.shiftKey
        && !e.repeat
        && !e.metaKey
        && !e.ctrlKey
        && !e.altKey;
      if (
        isShiftBackspace &&
        isSessionShortcutContext
      ) {
        e.preventDefault();
        el('editSessionCardBtn')?.click();
        return;
      }
      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.code === 'Numpad0';
      if (!isSpace || e.repeat) return;
      if (!canFlipSessionFlashcard(e.target, { allowButtonTarget: true })) return;
      e.preventDefault();
      flipSessionFlashcard();
    });
    document.addEventListener('keyup', e => {
      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.code === 'Numpad0';
      if (!isSpace) return;
      if (!canFlipSessionFlashcard(e.target, { allowButtonTarget: true })) return;
      e.preventDefault();
    });
  }
  const editBtn = el('editSessionCardBtn');
  if (editBtn) {
    editBtn.onclick = () => {
      if (!session.active) return;
      const card = session.activeQueue[0];
      if (!card) return;
      openEditDialog(card);
    };
  }
  const editBtnBack = el('editSessionCardBtnBack');
  if (editBtnBack && editBtn) editBtnBack.onclick = () => editBtn.click();
  const editDialog = el('editCardDialog');
  if (editDialog) {
    editDialog.addEventListener('click', e => {
      if (e.target === editDialog) editDialog.close();
    });
    editDialog.addEventListener('close', () => {
      editingCardId = null;
      editingCardSnapshot = null;
    });
  }
  const cardPreviewDialog = el('cardPreviewDialog');
  const closeCardPreviewBtn = el('closeCardPreviewBtn');
  const previewFlashcardEl = el('previewFlashcard');
  if (closeCardPreviewBtn && cardPreviewDialog) {
    closeCardPreviewBtn.onclick = () => closeDialog(cardPreviewDialog);
  }
  if (cardPreviewDialog) {
    cardPreviewDialog.addEventListener('click', e => {
      if (e.target === cardPreviewDialog) closeDialog(cardPreviewDialog);
    });
    cardPreviewDialog.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDialog(cardPreviewDialog);
        return;
      }
      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
      if (!isSpace || e.repeat) return;
      if (!canFlipPreviewFlashcard(e.target, { allowButtonTarget: true })) return;
      e.preventDefault();
      flipPreviewFlashcard();
    });
  }
  if (previewFlashcardEl) {
    previewFlashcardEl.addEventListener('click', e => {
      if (!canFlipPreviewFlashcard(e.target)) return;
      flipPreviewFlashcard();
    });
  }

  const sessionImageLightbox = el('sessionImageLightbox');
  const sessionImageLightboxImg = el('sessionImageLightboxImg');
  if (sessionImageLightbox) {
    sessionImageLightbox.addEventListener('click', e => {
      if (e.target !== sessionImageLightbox) return;
      closeStudyImageLightbox();
    });
  }
  if (sessionImageLightboxImg) {
    sessionImageLightboxImg.addEventListener('click', handleStudyImageLightboxImageClick);
    sessionImageLightboxImg.addEventListener('touchstart', handleStudyImageLightboxTouchStart, { passive: false });
    sessionImageLightboxImg.addEventListener('touchmove', handleStudyImageLightboxTouchMove, { passive: false });
    sessionImageLightboxImg.addEventListener('touchend', handleStudyImageLightboxTouchEnd, { passive: false });
    sessionImageLightboxImg.addEventListener('touchcancel', handleStudyImageLightboxTouchEnd, { passive: false });
    sessionImageLightboxImg.addEventListener('wheel', handleStudyImageLightboxWheel, { passive: false });
  }

  const moveCardsDialog = el('moveCardsDialog');
  if (moveCardsDialog) {
    moveCardsDialog.addEventListener('click', e => {
      if (e.target === moveCardsDialog) closeDialog(moveCardsDialog);
    });
  }

  const toggleCardSelectBtn = el('toggleCardSelectBtn');
  if (toggleCardSelectBtn) {
    toggleCardSelectBtn.onclick = () => {
      setDeckSelectionMode(!deckSelectionMode);
      loadDeck();
    };
  }
  const cancelCardSelectionBtn = el('cancelCardSelectionBtn');
  if (cancelCardSelectionBtn) {
    cancelCardSelectionBtn.onclick = () => {
      setDeckSelectionMode(false);
      loadDeck();
    };
  }
  const deleteSelectedCardsBtn = el('deleteSelectedCardsBtn');
  if (deleteSelectedCardsBtn) deleteSelectedCardsBtn.onclick = deleteSelectedDeckCards;
  const moveSelectedCardsBtn = el('moveSelectedCardsBtn');
  if (moveSelectedCardsBtn) moveSelectedCardsBtn.onclick = openMoveCardsDialog;

  const moveCardsSubjectSelect = el('moveCardsSubjectSelect');
  if (moveCardsSubjectSelect) {
    moveCardsSubjectSelect.addEventListener('change', () => populateMoveTopics(moveCardsSubjectSelect.value));
  }
  const confirmMoveCardsBtn = el('confirmMoveCardsBtn');
  if (confirmMoveCardsBtn) confirmMoveCardsBtn.onclick = moveSelectedDeckCards;
  const cancelMoveCardsBtn = el('cancelMoveCardsBtn');
  if (cancelMoveCardsBtn) cancelMoveCardsBtn.onclick = () => closeDialog(el('moveCardsDialog'));
  updateDeckSelectionUi();

  const moveTopicsDialog = el('moveTopicsDialog');
  if (moveTopicsDialog) {
    moveTopicsDialog.addEventListener('click', e => {
      if (e.target === moveTopicsDialog) closeDialog(moveTopicsDialog);
    });
  }
  const progressCheckDialog = el('progressCheckDialog');
  if (progressCheckDialog) {
    progressCheckDialog.addEventListener('click', e => {
      if (e.target === progressCheckDialog) {
        closeProgressCheckHeaderMenu();
        closeDialog(progressCheckDialog);
      }
    });
  }
  const closeProgressCheckBtn = el('closeProgressCheckBtn');
  if (closeProgressCheckBtn) {
    closeProgressCheckBtn.onclick = () => {
      closeProgressCheckHeaderMenu();
      closeDialog(el('progressCheckDialog'));
    };
  }
  const refreshProgressCheckBtn = el('refreshProgressCheckBtn');
  if (refreshProgressCheckBtn) {
    refreshProgressCheckBtn.onclick = async () => {
      await renderProgressCheckTable();
      if (progressCheckHeaderMenuState.column) renderProgressCheckHeaderMenu();
    };
  }
  wireProgressCheckHeaderMenus();
  const topicSearchDialog = el('topicSearchDialog');
  if (topicSearchDialog) {
    topicSearchDialog.addEventListener('click', e => {
      if (e.target === topicSearchDialog) closeDialog(topicSearchDialog);
    });
  }
  const toggleTopicSelectBtn = el('toggleTopicSelectBtn');
  if (toggleTopicSelectBtn) {
    toggleTopicSelectBtn.onclick = () => {
      setTopicSelectionMode(!topicSelectionMode);
      loadTopics();
    };
  }
  const openTopicSearchBtn = el('openTopicSearchBtn');
  if (openTopicSearchBtn) openTopicSearchBtn.onclick = openTopicSearchModal;
  const closeTopicSearchBtn = el('closeTopicSearchBtn');
  if (closeTopicSearchBtn) closeTopicSearchBtn.onclick = () => closeDialog(el('topicSearchDialog'));
  const runTopicSearchBtn = el('runTopicSearchBtn');
  if (runTopicSearchBtn) runTopicSearchBtn.onclick = runTopicSearch;
  const topicSearchInput = el('topicSearchInput');
  if (topicSearchInput) {
    topicSearchInput.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      runTopicSearch();
    });
  }
  const cancelTopicSelectionBtn = el('cancelTopicSelectionBtn');
  if (cancelTopicSelectionBtn) {
    cancelTopicSelectionBtn.onclick = () => {
      setTopicSelectionMode(false);
      loadTopics();
    };
  }
  const selectAllBulkTopicsBtn = el('selectAllBulkTopicsBtn');
  if (selectAllBulkTopicsBtn) selectAllBulkTopicsBtn.onclick = toggleAllTopicsForBulk;
  const deleteSelectedTopicsBtn = el('deleteSelectedTopicsBtn');
  if (deleteSelectedTopicsBtn) deleteSelectedTopicsBtn.onclick = deleteSelectedTopics;
  const selectAllSessionTopicsBtn = el('selectAllSessionTopicsBtn');
  if (selectAllSessionTopicsBtn) {
    selectAllSessionTopicsBtn.onclick = () => {
      void selectAllTopicsForSession();
    };
  }
  const moveSelectedTopicsBtn = el('moveSelectedTopicsBtn');
  if (moveSelectedTopicsBtn) moveSelectedTopicsBtn.onclick = openMoveTopicsDialog;
  const confirmMoveTopicsBtn = el('confirmMoveTopicsBtn');
  if (confirmMoveTopicsBtn) confirmMoveTopicsBtn.onclick = moveSelectedTopics;
  const cancelMoveTopicsBtn = el('cancelMoveTopicsBtn');
  if (cancelMoveTopicsBtn) cancelMoveTopicsBtn.onclick = () => closeDialog(el('moveTopicsDialog'));
  updateTopicSelectionUi();

  const sidebar = document.querySelector('.sidebar');
  const sidebarToggle = el('sidebarToggle');
  const sidebarToggleHome = el('sidebarToggleHome');
  const sidebarToggleButtons = [sidebarToggle, sidebarToggleHome].filter(Boolean);
  const sidebarOverlay = el('sidebarOverlay');
  sidebarToggleButtons.forEach(toggleBtn => {
    toggleBtn.onclick = () => document.body.classList.toggle('sidebar-open');
  });
  if (sidebarOverlay) {
    sidebarOverlay.onclick = () => document.body.classList.remove('sidebar-open');
  }
  document.addEventListener('click', e => {
    if (!document.body.classList.contains('sidebar-open')) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (sidebarToggleButtons.some(toggleBtn => toggleBtn.contains(target))) return;
    if (sidebar && sidebar.contains(target)) return;
    document.body.classList.remove('sidebar-open');
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) document.body.classList.remove('sidebar-open');
  });

  const editorShell = document.querySelector('#editorPanel .editor-shell');
  const editorOverlay = el('editorOverlay');
  const toggleSidebarBtn = el('toggleEditorSidebarBtn');
  if (toggleSidebarBtn && editorShell) {
    toggleSidebarBtn.onclick = () => editorShell.classList.toggle('sidebar-open');
  }
  if (editorOverlay && editorShell) {
    editorOverlay.onclick = () => editorShell.classList.remove('sidebar-open');
  }
  window.addEventListener('resize', () => {
    if (window.innerWidth > 980 && editorShell) editorShell.classList.remove('sidebar-open');
    if (currentView !== 3 && editorShell) editorShell.classList.remove('sidebar-open');
  });
  window.addEventListener('resize', queueSessionFaceOverflowSync);
  window.addEventListener('resize', scheduleOverviewTableFit);
  el('closeEditCardBtn').onclick = () => {
    editingCardId = null;
    editingCardSnapshot = null;
    el('editCardDialog').close();
  };
  el('editAddMcqOptionBtn').onclick = () => {
    setMcqModeState(true, true);
    addEditMcqRow();
    syncMcqPrimaryAnswerMode(true);
  };
  el('openCreateCardBtn').onclick = openCreateCardEditor;
  el('addMcqOptionBtn').onclick = () => {
    setMcqModeState(false, true);
    addMcqRow();
    syncMcqPrimaryAnswerMode(false);
  };
  attachAutoClose(el('cardPrompt'));
  attachAutoClose(el('cardAnswer'));
  attachAutoClose(el('editCardPrompt'));
  attachAutoClose(el('editCardAnswer'));
  [el('cardAnswer'), el('editCardAnswer')].forEach(input => {
    if (!(input instanceof HTMLTextAreaElement)) return;
    input.addEventListener('keydown', handlePrimaryMcqAnswerKeydown);
    input.addEventListener('input', () => enforcePrimaryMcqAnswerSingleLine(input));
  });
  ['dragover', 'drop'].forEach(evt => {
    document.addEventListener(evt, e => {
      e.preventDefault();
    }, true);
  });
  const plusLikeCode = new Set(['NumpadAdd', 'Equal', 'BracketRight', 'Backslash', 'IntlBackslash']);
  const isAddAnswerShortcut = e => {
    const isPlusLikeKey = e.key === '+' || e.key === '*';
    const isCtrlPlus = e.ctrlKey
      && !e.metaKey
      && !e.altKey
      && (isPlusLikeKey || plusLikeCode.has(e.code));
    return isCtrlPlus;
  };
  const createShortcut = e => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      el('addCardBtn').click();
      return;
    }
    if (isAddAnswerShortcut(e)) {
      e.preventDefault();
      el('addMcqOptionBtn')?.click();
    }
  };
  el('cardPrompt').addEventListener('keydown', createShortcut);
  el('cardAnswer').addEventListener('keydown', createShortcut);
  el('mcqOptions')?.addEventListener('keydown', createShortcut);
  el('cardPrompt').addEventListener('input', () => updateCreateValidation());
  el('cardAnswer').addEventListener('input', () => updateCreateValidation());
  wireLivePreview('cardPrompt', 'questionPreview', () => createQuestionTextAlign);
  wireLivePreview('cardAnswer', 'answerPreview', () => createAnswerTextAlign);
  const saveShortcut = e => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      el('saveEditCardBtn').click();
      return;
    }
    if (isAddAnswerShortcut(e)) {
      e.preventDefault();
      el('editAddMcqOptionBtn')?.click();
    }
  };
  el('editCardPrompt').addEventListener('keydown', saveShortcut);
  el('editCardAnswer').addEventListener('keydown', saveShortcut);
  el('editMcqOptions')?.addEventListener('keydown', saveShortcut);
  wireLivePreview('editCardPrompt', 'editQuestionPreview', () => editQuestionTextAlign);
  wireLivePreview('editCardAnswer', 'editAnswerPreview', () => editAnswerTextAlign);
  wireTextFormattingToolbar();
  document.querySelectorAll('.formula-btn').forEach(btn => {
    btn.onclick = () => openFormulaDialog(btn.dataset.formulaTarget);
  });
  const formulaDialog = el('formulaDialog');
  if (formulaDialog) {
    formulaDialog.addEventListener('click', e => {
      if (e.target === formulaDialog) formulaDialog.close();
    });
  }
  const closeFormulaBtn = el('closeFormulaBtn');
  const cancelFormulaBtn = el('cancelFormulaBtn');
  if (closeFormulaBtn) closeFormulaBtn.onclick = () => formulaDialog?.close();
  if (cancelFormulaBtn) cancelFormulaBtn.onclick = () => formulaDialog?.close();
  const formulaInput = el('formulaInput');
  const formulaDisplayToggle = el('formulaDisplayToggle');
  const insertFormulaBtn = el('insertFormulaBtn');
  const debouncedFormulaPreview = debounce(renderFormulaPreview, 300);
  if (formulaInput) formulaInput.addEventListener('input', debouncedFormulaPreview);
  if (formulaDisplayToggle) formulaDisplayToggle.addEventListener('change', renderFormulaPreview);
  if (insertFormulaBtn) insertFormulaBtn.onclick = insertFormulaImage;
  const tableDialog = el('tableDialog');
  if (tableDialog) {
    tableDialog.addEventListener('click', e => {
      if (e.target === tableDialog) closeDialog(tableDialog);
    });
    tableDialog.addEventListener('pointerdown', handleTableBuilderPointerDown);
    tableDialog.addEventListener('input', handleTableBuilderInput);
    tableDialog.addEventListener('focusin', handleTableBuilderSelection);
    tableDialog.addEventListener('click', handleTableBuilderSelection);
    tableDialog.addEventListener('keydown', e => {
      const isShiftEnter = e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
      const isMetaEnter = e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey;
      if (!isShiftEnter && !isMetaEnter) return;
      e.preventDefault();
      insertTableFromDialog();
    });
  }
  const closeTableBtn = el('closeTableBtn');
  const cancelTableBtn = el('cancelTableBtn');
  const insertTableBtn = el('insertTableBtn');
  const tableRowsInput = el('tableRowsInput');
  const tableColsInput = el('tableColsInput');
  const tableHeaderToggle = el('tableHeaderToggle');
  const tableRowsDownBtn = el('tableRowsDownBtn');
  const tableRowsUpBtn = el('tableRowsUpBtn');
  const tableColsDownBtn = el('tableColsDownBtn');
  const tableColsUpBtn = el('tableColsUpBtn');
  const tableBuilderGrid = el('tableBuilderGrid');
  const tableAlignLeftBtn = el('tableAlignLeftBtn');
  const tableAlignCenterBtn = el('tableAlignCenterBtn');
  const tableAlignRightBtn = el('tableAlignRightBtn');
  const tableMergeBtn = el('tableMergeBtn');
  const tableUnmergeBtn = el('tableUnmergeBtn');
  if (closeTableBtn) closeTableBtn.onclick = () => closeDialog(el('tableDialog'));
  if (cancelTableBtn) cancelTableBtn.onclick = () => closeDialog(el('tableDialog'));
  if (insertTableBtn) insertTableBtn.onclick = insertTableFromDialog;
  if (tableRowsInput) tableRowsInput.addEventListener('input', updateTableBuilderFromControls);
  if (tableColsInput) tableColsInput.addEventListener('input', updateTableBuilderFromControls);
  if (tableHeaderToggle) tableHeaderToggle.addEventListener('change', updateTableBuilderFromControls);
  if (tableRowsDownBtn) tableRowsDownBtn.onclick = () => stepTableBuilderSize('rows', -1);
  if (tableRowsUpBtn) tableRowsUpBtn.onclick = () => stepTableBuilderSize('rows', 1);
  if (tableColsDownBtn) tableColsDownBtn.onclick = () => stepTableBuilderSize('cols', -1);
  if (tableColsUpBtn) tableColsUpBtn.onclick = () => stepTableBuilderSize('cols', 1);
  if (tableBuilderGrid) {
    tableBuilderGrid.addEventListener('click', e => {
      const target = e.target;
      if (target instanceof HTMLInputElement && target.classList.contains('table-builder-cell-input')) return;
      clearTableBuilderSelection();
    });
  }
  if (tableAlignLeftBtn) tableAlignLeftBtn.onclick = () => applyTableBuilderSelectedAlignment('left');
  if (tableAlignCenterBtn) tableAlignCenterBtn.onclick = () => applyTableBuilderSelectedAlignment('center');
  if (tableAlignRightBtn) tableAlignRightBtn.onclick = () => applyTableBuilderSelectedAlignment('right');
  if (tableMergeBtn) tableMergeBtn.onclick = mergeTableBuilderSelection;
  if (tableUnmergeBtn) tableUnmergeBtn.onclick = unmergeTableBuilderSelection;
  attachImageDrop(el('cardPrompt'), dataUrls => {
    appendImagesToField(
      el('cardPrompt'),
      el('questionImagePreview'),
      dataUrls,
      'imageDataQ',
      updateCreateValidation
    );
  });
  attachImageDrop(el('questionImagePreview'), dataUrls => {
    appendImagesToField(
      el('cardPrompt'),
      el('questionImagePreview'),
      dataUrls,
      'imageDataQ',
      updateCreateValidation
    );
  });
  attachImagePicker(el('questionImagePreview'), dataUrls => {
    appendImagesToField(
      el('cardPrompt'),
      el('questionImagePreview'),
      dataUrls,
      'imageDataQ',
      updateCreateValidation
    );
  });
  attachImageDrop(el('cardAnswer'), dataUrls => {
    appendImagesToField(
      el('cardAnswer'),
      el('answerImagePreview'),
      dataUrls,
      'imageDataA',
      updateCreateValidation
    );
  });
  attachImageDrop(el('answerImagePreview'), dataUrls => {
    appendImagesToField(
      el('cardAnswer'),
      el('answerImagePreview'),
      dataUrls,
      'imageDataA',
      updateCreateValidation
    );
  });
  attachImagePicker(el('answerImagePreview'), dataUrls => {
    appendImagesToField(
      el('cardAnswer'),
      el('answerImagePreview'),
      dataUrls,
      'imageDataA',
      updateCreateValidation
    );
  });
  attachImageDrop(el('editCardPrompt'), dataUrls => {
    appendImagesToField(el('editCardPrompt'), el('editQuestionImagePreview'), dataUrls, 'imageDataQ');
  });
  attachImageDrop(el('editQuestionImagePreview'), dataUrls => {
    appendImagesToField(el('editCardPrompt'), el('editQuestionImagePreview'), dataUrls, 'imageDataQ');
  });
  attachImagePicker(el('editQuestionImagePreview'), dataUrls => {
    appendImagesToField(el('editCardPrompt'), el('editQuestionImagePreview'), dataUrls, 'imageDataQ');
  });
  attachImageDrop(el('editCardAnswer'), dataUrls => {
    appendImagesToField(el('editCardAnswer'), el('editAnswerImagePreview'), dataUrls, 'imageDataA');
  });
  attachImageDrop(el('editAnswerImagePreview'), dataUrls => {
    appendImagesToField(el('editCardAnswer'), el('editAnswerImagePreview'), dataUrls, 'imageDataA');
  });
  attachImagePicker(el('editAnswerImagePreview'), dataUrls => {
    appendImagesToField(el('editCardAnswer'), el('editAnswerImagePreview'), dataUrls, 'imageDataA');
  });

  el('cancelSubjectBtn').onclick = () => closeDialog(el('subjectDialog'));
  el('createSubjectBtn').onclick = addSubjectFromDialog;
  el('cancelSubjectEditBtn').onclick = () => el('subjectEditDialog').close();
  el('saveSubjectEditBtn').onclick = async () => {
    if (!editingSubjectId) return;
    const name = el('editSubjectName').value.trim();
    const accent = el('editSubjectColor').value || '#2dd4bf';
    if (!name) return;
    const existingSubject = (await getAll('subjects')).find(subject => subject.id === editingSubjectId);
    if (!existingSubject) return;
    const updatedSubject = buildSubjectRecord(existingSubject, { name, accent });
    await put('subjects', updatedSubject);
    if (selectedSubject?.id === editingSubjectId) {
      selectedSubject = { ...selectedSubject, ...updatedSubject };
      applySubjectTheme(accent);
    }
    editingSubjectId = null;
    el('subjectEditDialog').close();
    refreshSidebar();
    if (selectedSubject) loadTopics();
  };
  el('deleteSubjectBtn').onclick = async () => {
    if (!editingSubjectId) return;
    if (!confirm('Delete this subject and all its topics/cards?')) return;
    const id = editingSubjectId;
    editingSubjectId = null;
    el('subjectEditDialog').close();
    await deleteSubjectById(id);
  };

  el('subjectAccentPicker').addEventListener('input', e => {
    el('subjectAccentText').value = e.target.value;
  });
  el('subjectAccentText').addEventListener('input', e => {
    const v = e.target.value.trim();
    if (/^#([0-9a-fA-F]{3}){1,2}$/.test(v)) el('subjectAccentPicker').value = v;
  });
  el('subjectPalette').addEventListener('click', e => {
    const btn = e.target.closest('button[data-color]');
    if (!btn) return;
    const c = btn.dataset.color;
    el('subjectAccentPicker').value = c;
    el('subjectAccentText').value = c;
  });

  // subject accent editing moved to subject edit dialog

  const sessionMinus = el('sessionMinus');
  const sessionPlus = el('sessionPlus');
  const sessionSizeValue = el('sessionSizeValue');
  if (sessionMinus && sessionPlus && sessionSizeValue) {
    const SESSION_PLUS_LONG_PRESS_MS = 420;
    let sessionPlusLongPressTimer = null;
    let sessionPlusDidLongPress = false;

    const clearSessionPlusLongPress = () => {
      if (sessionPlusLongPressTimer !== null) {
        clearTimeout(sessionPlusLongPressTimer);
        sessionPlusLongPressTimer = null;
      }
    };

    const setSessionSizeToMax = () => {
      if (availableSessionCards <= 0) {
        sessionSize = 0;
        renderSessionSizeCounter();
        return;
      }
      const next = Math.max(1, availableSessionCards);
      if (sessionSize !== next) {
        markSessionSizeManualOverride();
        sessionSize = next;
        renderSessionSizeCounter();
      }
    };

    const startSessionPlusLongPress = () => {
      clearSessionPlusLongPress();
      sessionPlusDidLongPress = false;
      sessionPlusLongPressTimer = setTimeout(() => {
        sessionPlusLongPressTimer = null;
        sessionPlusDidLongPress = true;
        setSessionSizeToMax();
      }, SESSION_PLUS_LONG_PRESS_MS);
    };

    sessionMinus.onclick = () => {
      if (availableSessionCards <= 0) {
        sessionSize = 0;
        renderSessionSizeCounter();
        return;
      }
      markSessionSizeManualOverride();
      sessionSize = Math.max(1, sessionSize - 1);
      renderSessionSizeCounter();
    };
    sessionPlus.onclick = () => {
      if (sessionPlusDidLongPress) {
        sessionPlusDidLongPress = false;
        return;
      }
      if (availableSessionCards <= 0) {
        sessionSize = 0;
        renderSessionSizeCounter();
        return;
      }
      markSessionSizeManualOverride();
      sessionSize = Math.min(availableSessionCards, sessionSize + 1);
      renderSessionSizeCounter();
    };
    sessionPlus.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      startSessionPlusLongPress();
    });
    sessionPlus.addEventListener('pointerup', clearSessionPlusLongPress);
    sessionPlus.addEventListener('pointercancel', clearSessionPlusLongPress);
    sessionPlus.addEventListener('pointerleave', clearSessionPlusLongPress);
    sessionPlus.addEventListener('blur', clearSessionPlusLongPress);
    renderSessionSizeCounter();
  }

  const addTopicFromInput = async () => {
    if (!selectedSubject) return alert('Pick a subject first.');
    const name = el('topicName').value.trim();
    if (!name) return;
    await put('topics', { id: uid(), subjectId: selectedSubject.id, name });
    await touchSubject(selectedSubject.id);
    el('topicName').value = '';
    loadTopics();
    refreshSidebar();
  };
  el('addTopicBtn').onclick = addTopicFromInput;
  el('topicName').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addTopicFromInput();
  });

  el('addCardBtn').onclick = async () => {
    if (!selectedTopic) return alert('Pick a topic first.');
    if (!updateCreateValidation(true)) {
      createTouched = true;
      updateCreateValidation(true);
      return;
    }
    const imagesQ = getFieldImageList(el('cardPrompt'), 'imageDataQ');
    const imagesA = getFieldImageList(el('cardAnswer'), 'imageDataA');
    const cardId = uid();
    let imagePayload;
    try {
      imagePayload = await buildCardImagePayloadForSave(cardId, imagesQ, imagesA);
    } catch (err) {
      alert('Image upload failed. Please check your connection and try again.');
      console.warn('Card image upload failed:', err);
      return;
    }
    const options = parseMcqOptions();
    const type = options.length > 1 ? 'mcq' : 'qa';
    const createdAt = new Date().toISOString();
    const card = {
      id: cardId,
      topicId: selectedTopic.id,
      type,
      textAlign: normalizeTextAlign(createQuestionTextAlign),
      questionTextAlign: normalizeTextAlign(createQuestionTextAlign),
      answerTextAlign: normalizeTextAlign(createAnswerTextAlign),
      optionsTextAlign: normalizeTextAlign(createOptionsTextAlign),
      prompt: el('cardPrompt').value,
      answer: el('cardAnswer').value,
      options: type === 'mcq' ? options : [],
      ...imagePayload,
      createdAt,
      meta: { createdAt }
    };
    applyOptimisticCardCreate(card);
    const createdTopicId = String(card.topicId || '').trim();
    if (createdTopicId) {
      const bumpTopicCount = topic => {
        if (!topic || String(topic.id || '').trim() !== createdTopicId) return;
        const current = Number(topic.cardCount);
        topic.cardCount = Number.isFinite(current) ? current + 1 : 1;
      };
      currentSubjectTopics.forEach(bumpTopicCount);
      if (selectedTopic) bumpTopicCount(selectedTopic);
      const topicDirEntry = topicDirectoryById.get(createdTopicId);
      if (topicDirEntry) bumpTopicCount(topicDirEntry);
    }
    // Keep local snapshots in sync first, then persist remotely in background.
    void applyMutationToOfflineSnapshots('cards', 'put', card);
    apiQueryCache.set(`${API_BASE}/cards/${encodeURIComponent(card.id)}`, {
      ts: Date.now(),
      data: cloneData(card)
    });
    el('cardPrompt').value = '';
    el('cardAnswer').value = '';
    replaceFieldImages(el('cardPrompt'), el('questionImagePreview'), [], 'imageDataQ', updateCreateValidation);
    replaceFieldImages(el('cardAnswer'), el('answerImagePreview'), [], 'imageDataA', updateCreateValidation);
    const primaryToggle = el('primaryAnswerToggle');
    if (primaryToggle) primaryToggle.checked = true;
    el('mcqOptions').innerHTML = '';
    setMcqModeState(false, false);
    createTouched = false;
    updateCreateValidation();
    applyCreateQuestionTextAlign('center');
    applyCreateAnswerTextAlign('center');
    applyCreateOptionsTextAlign('center');
    void (async () => {
      try {
        await put('cards', card, {
          uiBlocking: false,
          skipFlushPending: true,
          invalidate: false
        });
        await putCardBank(card, { uiBlocking: false });
        if (selectedSubject?.id) await touchSubject(selectedSubject.id, undefined, { uiBlocking: false });
      } catch (err) {
        console.warn('Deferred post-create sync failed:', err);
      } finally {
        try {
          await refreshSidebar({ uiBlocking: false });
        } catch (err) {
          console.warn('Deferred post-create refresh failed:', err);
        }
      }
    })();
  };

  el('saveEditCardBtn').onclick = async () => {
    const saveBtn = el('saveEditCardBtn');
    if (!saveBtn || !editingCardId) return;
    if (saveBtn.dataset.busy === '1') return;
    saveBtn.dataset.busy = '1';
    saveBtn.disabled = true;

    const editingId = String(editingCardId || '').trim();
    const snapshot = (editingCardSnapshot && String(editingCardSnapshot?.id || '').trim() === editingId)
      ? cloneData(editingCardSnapshot)
      : null;
    const card = snapshot || await getById('cards', editingId);
    if (!card) {
      saveBtn.dataset.busy = '0';
      saveBtn.disabled = false;
      return;
    }

    const createdAt = card?.meta?.createdAt || card?.createdAt || new Date().toISOString();
    const updatedAt = new Date().toISOString();
    const imagesQ = getFieldImageList(el('editCardPrompt'), 'imageDataQ');
    const imagesA = getFieldImageList(el('editCardAnswer'), 'imageDataA');
    let imagePayload;
    try {
      imagePayload = await buildCardImagePayloadForSave(card.id, imagesQ, imagesA);
    } catch (err) {
      alert('Image upload failed. Please check your connection and try again.');
      console.warn('Card image upload failed:', err);
      saveBtn.dataset.busy = '0';
      saveBtn.disabled = false;
      return;
    }

    const options = parseEditMcqOptions();
    const type = options.length > 1 ? 'mcq' : 'qa';
    const updated = {
      ...card,
      createdAt,
      meta: {
        ...(card.meta || {}),
        createdAt,
        updatedAt
      },
      textAlign: normalizeTextAlign(editQuestionTextAlign),
      questionTextAlign: normalizeTextAlign(editQuestionTextAlign),
      answerTextAlign: normalizeTextAlign(editAnswerTextAlign),
      optionsTextAlign: normalizeTextAlign(editOptionsTextAlign),
      prompt: el('editCardPrompt').value,
      answer: el('editCardAnswer').value,
      options: type === 'mcq' ? options : [],
      type,
      ...imagePayload
    };

    // Immediate UI update first (fast close and optimistic rendering).
    syncSessionCard(updated);
    applyOptimisticCardUpdate(updated);
    if (session.active) void renderSessionCard();

    const editDialog = el('editCardDialog');
    if (editDialog?.open) editDialog.close();
    replaceFieldImages(el('editCardPrompt'), el('editQuestionImagePreview'), [], 'imageDataQ');
    replaceFieldImages(el('editCardAnswer'), el('editAnswerImagePreview'), [], 'imageDataA');
    setPreview('editQuestionPreview', '', editQuestionTextAlign);
    setPreview('editAnswerPreview', '', editAnswerTextAlign);

    void (async () => {
      try {
        await put('cards', updated, { uiBlocking: false });
        await putCardBank(updated, { uiBlocking: false });
        await touchSubjectByTopicId(updated.topicId, undefined, { uiBlocking: false });
      } catch (err) {
        console.warn('Deferred card edit sync failed:', err);
      } finally {
        try {
          await refreshSidebar({ uiBlocking: false });
          const cardsOverviewSection = el('cardsOverviewSection');
          const cardsOverviewVisible = cardsOverviewSection
            ? !cardsOverviewSection.classList.contains('hidden')
            : false;
          if (cardsOverviewVisible && selectedTopic?.id === updated.topicId) {
            void loadDeck();
          }
          if (currentView === 3 && selectedTopic?.id === updated.topicId) {
            void loadEditorCards();
          }
        } catch (err) {
          console.warn('Deferred post-edit refresh failed:', err);
        } finally {
          saveBtn.dataset.busy = '0';
          saveBtn.disabled = false;
        }
      }
    })();
  };

  document.querySelectorAll('[data-grade]').forEach(btn => {
    btn.addEventListener('click', () => gradeCard(btn.dataset.grade));
  });

  ensureKatexLoaded().then(loaded => {
    if (!loaded) return;
    rerenderAllRichMath();
  });
  await Promise.all([
    refreshSidebar(),
    refreshDailyReviewHomePanel({ useExisting: false })
  ]);
}

window.addEventListener('DOMContentLoaded', boot);
