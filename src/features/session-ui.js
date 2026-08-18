import { dom } from "../core/dom.js";
import { state, logEvent } from "../core/state.js";
import { refreshLayoutMetrics } from "./layout-metrics.js";

export function showLobby() {
  dom.lobbyScreen.hidden = false;
  dom.sessionView.hidden = true;
  document.body.classList.add("is-lobby");
  setHostBadge(false);
  console.info("[lobby-state]", "showLobby", {
    scrollY: Math.round(window.scrollY || 0),
    innerHeight: Math.round(window.innerHeight || 0),
    visualViewportHeight: Math.round(window.visualViewport?.height || 0),
    bodyScrollHeight: Math.round(document.body.scrollHeight || 0),
    bodyClientHeight: Math.round(document.body.clientHeight || 0),
    bodyClass: document.body.className,
  });
  refreshLayoutMetrics();
}

export function showSession() {
  dom.lobbyScreen.hidden = true;
  dom.sessionView.hidden = false;
  document.body.classList.remove("is-lobby");
  console.info("[lobby-state]", "showSession", {
    scrollY: Math.round(window.scrollY || 0),
    innerHeight: Math.round(window.innerHeight || 0),
    visualViewportHeight: Math.round(window.visualViewport?.height || 0),
    bodyScrollHeight: Math.round(document.body.scrollHeight || 0),
    bodyClientHeight: Math.round(document.body.clientHeight || 0),
    bodyClass: document.body.className,
  });
  refreshLayoutMetrics();
}

export function setHostBadge(visible) {
  if (!dom.hostBadge) return;
  dom.hostBadge.hidden = !visible;
}

export function focusMainWorkspace() {
  window.requestAnimationFrame(() => {
    const workspaceTop = dom.workspace?.offsetTop ?? 0;
    console.info("[lobby-state]", "focusMainWorkspace", {
      workspaceTop,
      scrollY: Math.round(window.scrollY || 0),
      innerHeight: Math.round(window.innerHeight || 0),
      bodyClass: document.body.className,
    });
    window.scrollTo({ top: workspaceTop, behavior: "auto" });
  });
}

export function focusFullscreenWorkspace() {
  window.requestAnimationFrame(() => {
    dom.videoArea?.scrollIntoView({ block: "start", inline: "nearest" });
  });
}

export function setSyncStatus(text) {
  window.clearTimeout(state.player.syncStatusTimer);
  if (dom.lobbyStatus) dom.lobbyStatus.textContent = text;
  state.player.syncStatusTimer = window.setTimeout(() => {
    if (dom.lobbyStatus) dom.lobbyStatus.textContent = "Listo";
  }, 4500);
}

export function setConnection(mode, label) {
  if (!dom.connectionStatus) return;

  const nextMode =
    mode === "firebase"
      ? "online"
      : ["online", "local", "starting", "error"].includes(mode)
        ? mode
        : "online";
  const tooltipByMode = {
    online: "La sala está funcionando",
    local: "La sala está funcionando",
    starting: "Conectando con la sala",
    error: label && label !== "Sin conexión" ? label : "La sala no pudo conectarse",
  };
  const nextLabel = nextMode === "starting" ? "Iniciando" : nextMode === "error" ? "Sin conexión" : "Conectado";
  const nextTooltip = tooltipByMode[mode === "firebase" ? "online" : nextMode];

  dom.connectionStatus.dataset.state = nextMode;
  dom.connectionStatus.dataset.tooltip = nextTooltip;
  dom.connectionStatus.setAttribute(
    "aria-label",
    `Estado de la aplicación: ${nextLabel}. ${nextTooltip}`,
  );
  logEvent("connection", nextLabel);
}

let errorDialogInitialized = false;
let confirmLoadDialogInitialized = false;
let slowLoadDialogInitialized = false;
let resumeVideoDialogInitialized = false;
let aboutDialogInitialized = false;
let pendingLoadDialogResolver = null;
let pendingSlowLoadDialogResolver = null;
let pendingResumeVideoDialogResolver = null;

export function initializeAboutDialog() {
  if (aboutDialogInitialized || !dom.aboutDialog || !dom.aboutButton) return;

  dom.aboutButton.addEventListener("click", () => {
    dom.aboutDialog.showModal();
    dom.closeAboutDialogButton?.focus();
  });

  dom.closeAboutDialogButton?.addEventListener("click", () => {
    dom.aboutDialog.close();
  });

  dom.aboutDialog.addEventListener("click", (event) => {
    if (event.target === dom.aboutDialog) dom.aboutDialog.close();
  });

  aboutDialogInitialized = true;
}

export function showErrorDialog(message) {
  if (!dom.errorDialog) return;

  if (message) {
    const msgEl = dom.errorDialog.querySelector("#dialogMessage");
    if (msgEl) msgEl.textContent = message;
  }

  if (!errorDialogInitialized && dom.closeDialogButton) {
    dom.closeDialogButton.addEventListener("click", () => {
      dom.errorDialog.close();
    });
    errorDialogInitialized = true;
  }

  dom.errorDialog.showModal();
}

export function showLoadReplaceDialog(message) {
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
