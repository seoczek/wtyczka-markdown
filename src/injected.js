(() => {
  const WMExt = (globalThis.WMExt ??= {});

  function probeSelection() {
    const field = document.activeElement;
    const fieldSize = typeof field?.selectionStart === "number" ? Math.abs((field.selectionEnd ?? 0) - field.selectionStart) : 0;
    const size = getSelection()?.toString().trim().length || fieldSize || globalThis.WMExt?.stub?.getSnapshot?.()?.text.length || 0;
    return { size, focused: document.hasFocus() };
  }

  async function copyInPage(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const listener = (event) => {
        event.preventDefault();
        event.clipboardData.setData("text/plain", text);
      };
      document.addEventListener("copy", listener, { once: true, capture: true });
      const copied = document.execCommand("copy");
      document.removeEventListener("copy", listener, { capture: true });
      return copied;
    }
  }

  WMExt.injected = { probeSelection, copyInPage };
})();
