import { dom } from "../core/dom.js?v=20261010-file-size-refactor-02";

let errorDialogInitialized = false;
let confirmLoadDialogInitialized = false;
let slowLoadDialogInitialized = false;
let resumeVideoDialogInitialized = false;
let pendingLoadDialogResolver = null;
let pendingSlowLoadDialogResolver = null;
let pendingResumeVideoDialogResolver = null;

export function showErrorDialog(message) {
  if (!dom.errorDialog) return;

  if (message) {
    const msgEl = dom.errorDialog.querySelector("#dialogMessage");
    if (msgEl) msgEl.textContent = message;
  }

  if (!errorDialogInitialized) {
    const closeErrorDialog = () => dom.errorDialog.close();
    dom.closeDialogButton?.addEventListener("click", closeErrorDialog);
    dom.closeDialogActionButton?.addEventListener("click", closeErrorDialog);
    dom.errorDialog.addEventListener("click", (event) => {
      if (event.target === dom.errorDialog) closeErrorDialog();
    });
    errorDialogInitialized = true;
  }

  dom.errorDialog.showModal();
}

export function showLoadReplaceDialog(message, options = {}) {
  if (!dom.confirmLoadDialog) {
    return Promise.resolve({ confirmed: true, skipFutureWarnings: false });
  }

  initializeConfirmLoadDialog();
  if (pendingLoadDialogResolver) {
    pendingLoadDialogResolver({ confirmed: false, skipFutureWarnings: false });
    pendingLoadDialogResolver = null;
  }
  if (dom.confirmLoadDialog.open) {
    dom.confirmLoadDialog.close();
  }

  if (dom.confirmLoadDialogMessage && message) {
    dom.confirmLoadDialogMessage.textContent = message;
  }
  const isRemoveAction = options.action === "remove";
  if (dom.confirmLoadDialogTitle) {
    dom.confirmLoadDialogTitle.textContent = isRemoveAction ? "Quitar el video" : "Cargar otro video";
  }
  if (dom.confirmLoadDialogButton) {
    dom.confirmLoadDialogButton.textContent = isRemoveAction ? "Quitar" : "Cargar";
    dom.confirmLoadDialogButton.classList.toggle("warning", isRemoveAction);
    dom.confirmLoadDialogButton.classList.toggle("primary", !isRemoveAction);
  }
  if (dom.skipLoadConfirmCheckbox) {
    dom.skipLoadConfirmCheckbox.checked = false;
  }

  return new Promise((resolve) => {
    pendingLoadDialogResolver = resolve;
    dom.confirmLoadDialog.showModal();
  });
}

export function showSlowLoadDialog(message) {
  if (!dom.slowLoadDialog) {
    return Promise.resolve(false);
  }

  initializeSlowLoadDialog();
  dismissResumeVideoDialog();
  if (pendingSlowLoadDialogResolver) {
    pendingSlowLoadDialogResolver(false);
    pendingSlowLoadDialogResolver = null;
  }
  if (dom.slowLoadDialog.open) {
    dom.slowLoadDialog.close();
  }

  if (dom.slowLoadDialogMessage && message) {
    dom.slowLoadDialogMessage.textContent = message;
  }

  return new Promise((resolve) => {
    pendingSlowLoadDialogResolver = resolve;
    dom.slowLoadDialog.showModal();
  });
}

export function showResumeVideoDialog(message) {
  if (!dom.resumeVideoPopup) {
    return Promise.resolve(false);
  }

  initializeResumeVideoDialog();
  dismissSlowLoadDialog();
  if (pendingResumeVideoDialogResolver) {
    pendingResumeVideoDialogResolver(false);
    pendingResumeVideoDialogResolver = null;
  }
  if (dom.resumeVideoPopup.hidden === false) {
    dismissResumeVideoDialog();
  }

  if (dom.resumeVideoPopupMessage && message) {
    dom.resumeVideoPopupMessage.innerHTML = message;
  }

  return new Promise((resolve) => {
    pendingResumeVideoDialogResolver = resolve;
    dom.resumeVideoPopup.hidden = false;
    window.setTimeout(() => {
      dom.cancelResumeVideoDialogButton?.focus();
    }, 0);
  });
}

function initializeConfirmLoadDialog() {
  if (confirmLoadDialogInitialized || !dom.confirmLoadDialog) return;

  dom.confirmLoadDialogButton?.addEventListener("click", () => {
    resolveLoadReplaceDialog(true);
  });

  dom.cancelLoadDialogButton?.addEventListener("click", () => {
    resolveLoadReplaceDialog(false);
  });

  dom.closeConfirmLoadDialogButton?.addEventListener("click", () => {
    resolveLoadReplaceDialog(false);
  });

  dom.confirmLoadDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveLoadReplaceDialog(false);
  });

  confirmLoadDialogInitialized = true;
}

function resolveLoadReplaceDialog(confirmed) {
  const skipFutureWarnings = confirmed && Boolean(dom.skipLoadConfirmCheckbox?.checked);
  if (dom.confirmLoadDialog?.open) {
    dom.confirmLoadDialog.close();
  }
  const resolver = pendingLoadDialogResolver;
  pendingLoadDialogResolver = null;
  resolver?.({ confirmed, skipFutureWarnings });
}

function initializeSlowLoadDialog() {
  if (slowLoadDialogInitialized || !dom.slowLoadDialog) return;

  dom.confirmSlowLoadDialogButton?.addEventListener("click", () => {
    resolveSlowLoadDialog(true);
  });

  dom.cancelSlowLoadDialogButton?.addEventListener("click", () => {
    resolveSlowLoadDialog(false);
  });

  dom.closeSlowLoadDialogButton?.addEventListener("click", () => {
    resolveSlowLoadDialog(false);
  });

  dom.slowLoadDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveSlowLoadDialog(false);
  });

  slowLoadDialogInitialized = true;
}

function resolveSlowLoadDialog(confirmed) {
  dismissSlowLoadDialog();
  const resolver = pendingSlowLoadDialogResolver;
  pendingSlowLoadDialogResolver = null;
  resolver?.(confirmed);
}

function initializeResumeVideoDialog() {
  if (resumeVideoDialogInitialized || !dom.resumeVideoPopup) return;

  dom.confirmResumeVideoDialogButton?.addEventListener("click", () => {
    resolveResumeVideoDialog(true);
  });

  dom.cancelResumeVideoDialogButton?.addEventListener("click", () => {
    resolveResumeVideoDialog(false);
  });

  dom.closeResumeVideoDialogButton?.addEventListener("click", () => {
    resolveResumeVideoDialog(false);
  });

  dom.resumeVideoPopup.addEventListener("click", (event) => {
    if (event.target === dom.resumeVideoPopup) {
      resolveResumeVideoDialog(false);
    }
  });

  window.addEventListener("keydown", handleResumePopupKeydown);

  resumeVideoDialogInitialized = true;
}

function resolveResumeVideoDialog(confirmed) {
  dismissResumeVideoDialog();
  const resolver = pendingResumeVideoDialogResolver;
  pendingResumeVideoDialogResolver = null;
  resolver?.(confirmed);
}

function dismissSlowLoadDialog() {
  if (dom.slowLoadDialog?.open) {
    dom.slowLoadDialog.close();
  }
}

function dismissResumeVideoDialog() {
  if (dom.resumeVideoPopup) {
    dom.resumeVideoPopup.hidden = true;
  }
}

function handleResumePopupKeydown(event) {
  if (event.key !== "Escape") return;
  if (!dom.resumeVideoPopup || dom.resumeVideoPopup.hidden) return;
  resolveResumeVideoDialog(false);
}
