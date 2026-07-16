import { dom } from "../core/dom.js";
import { state, logEvent } from "../core/state.js";

export function showLobby() {
  dom.lobbyScreen.hidden = false;
  dom.sessionView.hidden = true;
  document.body.classList.add("is-lobby");
  setHostBadge(false);
}

export function showSession() {
  dom.lobbyScreen.hidden = true;
  dom.sessionView.hidden = false;
  document.body.classList.remove("is-lobby");
}

export function setHostBadge(visible) {
  if (!dom.hostBadge) return;
  dom.hostBadge.hidden = !visible;
}

export function focusMainWorkspace() {
  window.requestAnimationFrame(() => {
    dom.workspace?.scrollIntoView({ block: "start" });
  });
}

export function focusFullscreenWorkspace() {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    dom.workspace?.scrollIntoView({ block: "start", inline: "nearest" });
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
  const defaultLabelByMode = {
    online: "Funcionando",
    local: "Funcionando",
    starting: "Iniciando",
    error: "Sin conexion",
  };
  const nextLabel =
    label && !/firebase/i.test(label) && !/modo local/i.test(label)
      ? label
      : defaultLabelByMode[nextMode];

  dom.connectionStatus.dataset.state = nextMode;
  if (dom.connectionStatusLabel) {
    dom.connectionStatusLabel.textContent = nextLabel;
  } else {
    dom.connectionStatus.textContent = nextLabel;
  }
  dom.connectionStatus.setAttribute("aria-label", `Estado de la aplicacion: ${nextLabel}`);
  logEvent("connection", nextLabel);
}
