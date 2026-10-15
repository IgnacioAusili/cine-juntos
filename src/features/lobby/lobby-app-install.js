export function wireLobbyAppInstall() {
  const card = document.querySelector("#lobbyAppInvite");
  const button = document.querySelector("#lobbyAppInstallButton");
  const dialog = document.querySelector("#lobbyAppInstallDialog");

  if (!card || !button || !dialog) return;

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || navigator.standalone === true;

  if (isStandalone) {
    card.hidden = true;
    return;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
  });

  button.addEventListener("click", () => {
    if (!dialog.open) dialog.showModal();
    button.setAttribute("aria-expanded", "true");
  });

  dialog.querySelectorAll("[data-lobby-install-close]").forEach((closeButton) => {
    closeButton.addEventListener("click", () => dialog.close());
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    button.setAttribute("aria-expanded", "false");
  });

  window.addEventListener("appinstalled", () => {
    card.hidden = true;
    if (dialog.open) dialog.close();
  });
}
