(function (global) {
  const WMExt = (global.WMExt = global.WMExt || {});
  const uiState = {
    actionButton: null,
    toast: null,
    selectionTimer: 0,
    hideTimer: 0,
    lastPointer: null,
    pointerDown: false,
    selectionSnapshot: null
  };

  function clearSelection() {
    const selection = global.getSelection();
    if (!selection) {
      return;
    }

    try {
      selection.removeAllRanges();
    } catch (error) {
      // Ignore browser-specific selection errors.
    }
  }

  function isEditableNode(node) {
    if (!node || !(node instanceof global.Node)) {
      return false;
    }

    const element = node.nodeType === global.Node.ELEMENT_NODE ? node : node.parentElement;
    if (!element) {
      return false;
    }

    return Boolean(
      element.closest("input, textarea, [contenteditable='true'], [contenteditable=''], [role='textbox']")
    );
  }

  function getCurrentSelectionSnapshot() {
    const selection = global.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }

    if (isEditableNode(selection.anchorNode)) {
      return null;
    }

    const text = selection.toString().replace(/\u00a0/g, " ").trim();
    if (!text) {
      return null;
    }

    try {
      const range = selection.getRangeAt(0);
      const container = global.document.createElement("div");
      container.appendChild(range.cloneContents());

      return {
        html: container.innerHTML,
        text,
        title: global.document.title || "",
        url: global.location?.href || ""
      };
    } catch (error) {
      return null;
    }
  }

  function rememberSelectionSnapshot() {
    const snapshot = getCurrentSelectionSnapshot();
    if (snapshot) {
      uiState.selectionSnapshot = snapshot;
    }

    return snapshot;
  }

  function ensureToast() {
    if (uiState.toast?.isConnected) {
      return uiState.toast;
    }

    const toast = global.document.createElement("div");
    toast.style.cssText = [
      "position: fixed",
      "right: 16px",
      "bottom: 16px",
      "z-index: 2147483647",
      "max-width: 320px",
      "padding: 11px 14px",
      "border-radius: 14px",
      "background: rgba(26, 35, 31, 0.94)",
      "color: #f7f4ee",
      "font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28)",
      "opacity: 0",
      "transform: translateY(8px)",
      "pointer-events: none",
      "transition: opacity 140ms ease, transform 140ms ease"
    ].join(";");

    global.document.documentElement.appendChild(toast);
    uiState.toast = toast;
    return toast;
  }

  function showToast(message, tone) {
    const toast = ensureToast();
    toast.textContent = message;
    toast.style.background =
      tone === "error"
        ? "rgba(127, 29, 29, 0.96)"
        : tone === "warning"
          ? "rgba(120, 53, 15, 0.96)"
          : "rgba(26, 35, 31, 0.94)";
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";

    global.clearTimeout(showToast.timerId);
    showToast.timerId = global.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
    }, 2200);
  }

  function ensureActionButton() {
    if (uiState.actionButton?.isConnected) {
      return uiState.actionButton;
    }

    const button = global.document.createElement("button");
    button.type = "button";
    button.textContent = "MD";
    button.setAttribute("aria-label", "Konwertuj zaznaczenie do Markdown");
    button.style.cssText = [
      "position: fixed",
      "z-index: 2147483647",
      "display: none",
      "align-items: center",
      "justify-content: center",
      "min-width: 44px",
      "height: 36px",
      "padding: 0 12px",
      "border: 0",
      "border-radius: 999px",
      "background: linear-gradient(135deg, #1f5f4a, #2b7a60)",
      "color: #ffffff",
      "font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "box-shadow: 0 12px 28px rgba(31, 95, 74, 0.28)",
      "cursor: pointer",
      "user-select: none",
      "pointer-events: auto"
    ].join(";");

    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      hideActionButton();
      const settings = await WMExt.settings.loadSettings();
      const result = await WMExt.extractor.quickConvert(
        {
          mode: "smart",
          collectMode: settings.collectMode,
          autoCopy: true,
          trigger: "floating-button",
          selectionSnapshot: uiState.selectionSnapshot
        },
        global
      );

      if (!result.ok) {
        showToast(result.error, "warning");
        return;
      }

      clearSelection();
      uiState.lastPointer = null;
      uiState.selectionSnapshot = null;

      if (result.copied && result.appendedToSession) {
        showToast(`Skopiowano Markdown i dopisano do sesji (${result.sessionStats?.fragments || 0}).`);
        return;
      }

      if (result.copied) {
        showToast("Skopiowano Markdown do schowka.");
        return;
      }

      if (result.appendedToSession) {
        showToast("Dopisano do sesji, ale kopiowanie się nie powiodło.", "warning");
        return;
      }

      showToast("Markdown wygenerowany, ale nie udało się go skopiować.", "warning");
    });

    global.document.documentElement.appendChild(button);
    uiState.actionButton = button;
    return button;
  }

  function hideActionButton() {
    global.clearTimeout(uiState.hideTimer);
    const button = ensureActionButton();
    button.style.display = "none";
  }

  function scheduleHideActionButton(delay) {
    global.clearTimeout(uiState.hideTimer);
    uiState.hideTimer = global.setTimeout(hideActionButton, delay || 0);
  }

  function getSelectionAnchorPoint(selection) {
    if (uiState.lastPointer && selection && !selection.isCollapsed) {
      return {
        left: uiState.lastPointer.clientX,
        top: uiState.lastPointer.clientY
      };
    }

    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) {
      return null;
    }

    return {
      left: Math.max(rect.right, rect.left),
      top: rect.bottom
    };
  }

  function positionActionButton() {
    const selection = global.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      hideActionButton();
      return;
    }

    if (isEditableNode(selection.anchorNode)) {
      hideActionButton();
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      hideActionButton();
      return;
    }

    rememberSelectionSnapshot();

    const point = getSelectionAnchorPoint(selection);
    if (!point) {
      hideActionButton();
      return;
    }

    const button = ensureActionButton();
    const gap = 12;
    const maxLeft = Math.max(global.innerWidth - 64, 8);
    const maxTop = Math.max(global.innerHeight - 52, 8);
    button.style.display = "inline-flex";
    button.style.left = `${Math.min(Math.max(point.left + gap, 8), maxLeft)}px`;
    button.style.top = `${Math.min(Math.max(point.top + gap, 8), maxTop)}px`;
  }

  function queueActionButtonPosition() {
    global.clearTimeout(uiState.selectionTimer);
    rememberSelectionSnapshot();
    uiState.selectionTimer = global.setTimeout(positionActionButton, 16);
  }

  function updatePointer(event) {
    uiState.lastPointer = {
      clientX: event.clientX,
      clientY: event.clientY
    };
  }

  function handlePointerDown(event) {
    if (uiState.actionButton && uiState.actionButton.contains(event.target)) {
      return;
    }

    uiState.pointerDown = true;
    uiState.selectionSnapshot = null;
    updatePointer(event);
  }

  function handlePointerMove(event) {
    updatePointer(event);
    if (uiState.pointerDown) {
      queueActionButtonPosition();
    }
  }

  function handlePointerUp(event) {
    uiState.pointerDown = false;
    updatePointer(event);
    queueActionButtonPosition();
  }

  function handleDocumentClick(event) {
    if (uiState.actionButton && uiState.actionButton.contains(event.target)) {
      return;
    }

    const selection = global.getSelection();
    if (!selection || selection.isCollapsed) {
      scheduleHideActionButton(0);
    }
  }

  async function handleExtractSelection(message) {
    const result = await WMExt.extractor.extractSelection(
      {
        ...(message.options || {}),
        selectionSnapshot: uiState.selectionSnapshot
      },
      global
    );

    if (result.ok) {
      clearSelection();
      uiState.lastPointer = null;
      uiState.selectionSnapshot = null;
    }

    return result;
  }

  async function handleQuickConvert(message) {
    const result = await WMExt.extractor.quickConvert(
      {
        ...(message.options || {}),
        selectionSnapshot: uiState.selectionSnapshot
      },
      global
    );

    if (!result.ok) {
      showToast(result.error, "warning");
      return result;
    }

    clearSelection();
    uiState.lastPointer = null;
    uiState.selectionSnapshot = null;

    if (result.copied && result.appendedToSession) {
      showToast(`Skopiowano Markdown i dopisano do sesji (${result.sessionStats?.fragments || 0}).`);
    } else if (result.copied) {
      showToast("Skopiowano Markdown do schowka.");
    } else if (message.options?.autoCopy) {
      const text = result.appendedToSession
        ? "Markdown dopisany do sesji, ale kopiowanie się nie powiodło."
        : "Markdown wygenerowany, ale kopiowanie się nie powiodło.";
      showToast(text, "warning");
    } else if (result.appendedToSession) {
      showToast(`Markdown dopisany do sesji (${result.sessionStats?.fragments || 0}).`);
    } else {
      showToast("Markdown wygenerowany.");
    }

    return result;
  }

  function sendAsyncResponse(task, sendResponse) {
    task()
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error?.message || "Nie udało się wykonać akcji rozszerzenia."
        });
      });
  }

  if (global.chrome?.runtime?.onMessage) {
    global.chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message?.type) {
        return undefined;
      }

      if (message.type === "WM_EXTRACT_SELECTION") {
        sendAsyncResponse(() => handleExtractSelection(message), sendResponse);
        return true;
      }

      if (message.type === "WM_RUN_QUICK_CONVERT") {
        sendAsyncResponse(() => handleQuickConvert(message), sendResponse);
        return true;
      }

      return undefined;
    });
  }

  global.document.addEventListener("selectionchange", queueActionButtonPosition, true);
  global.document.addEventListener("mousedown", handlePointerDown, true);
  global.document.addEventListener("mousemove", handlePointerMove, true);
  global.document.addEventListener("mouseup", handlePointerUp, true);
  global.document.addEventListener("click", handleDocumentClick, true);
  global.addEventListener("scroll", queueActionButtonPosition, true);
  global.addEventListener("resize", queueActionButtonPosition, true);
})(window);
