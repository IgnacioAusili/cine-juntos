import {
  dom,
} from "../core/dom.js?v=20261010-file-size-refactor-02";
import {
  showErrorDialog,
  showLoadReplaceDialog,
  showResumeVideoDialog,
  showSlowLoadDialog,
  showSession,
} from "./session-ui.js?v=20261010-file-size-refactor-02";
import { setVideoStatus } from "./player/player-video-source.js?v=20261011-overlay-scroll-top-01";
import { openLightboxForTest } from "./chat/image-lightbox.js?v=20261010-file-size-refactor-02";

export const DIALOG_TEST_ROUTES = Object.freeze({
  about: "Sobre este proyecto",
  error: "No se pudo cargar el video",
  "slow-load": "La carga del video está tardando",
  "confirm-load": "Cargar otro video",
  resume: "Retomar reproducción",
  "mobile-debug": "Registros de la página",
  "image-lightbox": "Visor de imagen",
});

export const PLAYER_TEST_ROUTES = Object.freeze({
  loading: "Reproductor en estado de carga",
});

function getDialogTestName() {
  const match = window.location.pathname.match(/^\/test\/dialog\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]).toLowerCase() : "";
}

function getPlayerTestName() {
  const match = window.location.pathname.match(/^\/test\/player\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]).toLowerCase() : "";
}

export function openDialogTestRoute() {
  const playerTestName = getPlayerTestName();
  if (playerTestName === "loading") {
    showSession();
    dom.emptyPlayer?.classList.add("hidden");
    dom.videoPlayer?.removeAttribute("src");
    setVideoStatus("loading", "Cargando video");
    dom.playerFrame?.classList.add("player-overlay-visible");
    return;
  }

  const name = getDialogTestName();
  if (!name || !Object.hasOwn(DIALOG_TEST_ROUTES, name)) return;

  switch (name) {
    case "about":
      dom.aboutButton?.click();
      break;
    case "error":
      showErrorDialog("Este es un error de reproducción de prueba.");
      break;
    case "slow-load":
      void showSlowLoadDialog("Este diálogo simula una carga de video lenta.");
      break;
    case "confirm-load":
      void showLoadReplaceDialog("Este diálogo simula la carga de otro video.");
      break;
    case "resume":
      showSession();
      void showResumeVideoDialog(
        "Este video ya lo has reproducido antes en <span class=\"resume-time-tag\">1:23</span> ¿Quieres retomar desde ahí?",
      );
      break;
    case "mobile-debug":
      dom.mobileDebugDialog?.showModal();
      dom.mobileDebugCloseButton?.focus();
      break;
    case "image-lightbox":
      openLightboxForTest();
      break;
    default:
      break;
  }
}
