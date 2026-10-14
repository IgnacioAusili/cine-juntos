function getInstallInstructions() {
  const userAgent = navigator.userAgent;
  const isAppleMobile = /iPhone|iPad|iPod/.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isAppleMobile) {
    return "En Safari, tocá Compartir y elegí “Agregar a pantalla de inicio”.";
  }

  return "Abrí el menú del navegador y buscá “Instalar app” o “Agregar a pantalla de inicio”.";
}

export function wireLobbyAppInstall() {
  const card = document.querySelector("#lobbyAppInvite");
  const button = document.querySelector("#lobbyAppInstallButton");
  const label = button?.querySelector("[data-lobby-install-label]");
  const help = document.querySelector("#lobbyAppInstallHelp");

  if (!card || !button || !label || !help) return;

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || navigator.standalone === true;

  if (isStandalone) {
    card.hidden = true;
    return;
  }

  let installPrompt = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    label.textContent = "Instalar app";
  });

  button.addEventListener("click", async () => {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;

      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice?.outcome === "accepted") {
          card.hidden = true;
          return;
        }
      } catch {
        // Si el navegador no acepta la solicitud, se muestran las instrucciones manuales.
      }

      label.textContent = "Ver cómo";
    }

    const shouldOpenHelp = help.hidden;
    help.textContent = getInstallInstructions();
    help.hidden = !shouldOpenHelp;
    button.setAttribute("aria-expanded", String(shouldOpenHelp));
    card.classList.toggle("is-help-open", shouldOpenHelp);
  });

  window.addEventListener("appinstalled", () => {
    card.hidden = true;
  });
}
