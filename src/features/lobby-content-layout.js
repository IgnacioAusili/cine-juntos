let lobbyCenterFrame = 0;

import { resetTitleFit, syncLobbyTitleFit, syncSingleColumnTitleLift, syncSingleColumnTitleGroup, resetSingleColumnTitleLift, resetSingleColumnTitleGroup, resetSingleColumnDescriptionPlacement, syncLobbyTextDensity, syncLobbyTicketInlinePadding } from "./lobby-title-layout.js?v=20261010-file-size-refactor-02";
import { syncSingleColumnDescriptionPlacement, resetLobbyAboutButtonContact, syncLobbyAboutButtonContact, syncSingleColumnContentGap, syncSingleColumnTicketPlacement } from "./lobby-content-variants.js?v=20261010-file-size-refactor-02";
import { resetLobbyTicketPlacement, syncLobbyTicketPlacement, syncLobbyTitlePlacement } from "./lobby-ticket-placement.js?v=20261010-file-size-refactor-02";

export function syncLobbyContentCenter() {
  lobbyCenterFrame = 0;
  if (!document.body.classList.contains("is-lobby")) return;

  const isColumns = document.body.dataset.lobbyLayout === "columns";
  const screen = document.querySelector("#lobbyScreen");
  const marquee = screen?.querySelector(".lobby-marquee");
  const footer = screen?.querySelector(".lobby-footer");
  const grid = screen?.querySelector(".lobby-grid");
  const content = screen
    ? [...screen.querySelectorAll(".lobby-hero, .lobby-ticket")]
    : [];
  const hero = screen?.querySelector(".lobby-hero");
  const ticket = screen?.querySelector(".lobby-ticket");

  // En el modo columns primero se prueba la composición real. Si un título
  // de prestaciones queda recortado en su tarjeta, el ancho restante ya no
  // alcanza para mostrar ambas columnas con claridad y el grid pasa a una.
  if (isColumns && grid) document.body.dataset.lobbyFlow = "columns";
  const gridColumns = grid ? getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/) : [];
  const featureHeadings = hero ? [...hero.querySelectorAll(".lobby-feature-text strong")] : [];
  const hasClippedFeatureHeading = featureHeadings.some((heading) => {
    if (heading.getClientRects().length === 0 || heading.clientWidth === 0) return false;

    const compactTitle = heading.querySelector(".lobby-feature-title-short");
    const compactTitleIsVisible = compactTitle?.getClientRects().length > 0;
    const isClipped = heading.scrollWidth > heading.clientWidth + 1;

    // El título largo ya se recorta de forma intencional y tiene una versión
    // corta para este espacio. Pasa a vertical cuando también se desborda la
    // versión corta que realmente ve el usuario.
    return isClipped && (!compactTitle || compactTitleIsVisible);
  });
  const isSingleColumn = Boolean(grid) && (
    gridColumns.length < 2 || (isColumns && hasClippedFeatureHeading)
  );
  document.body.dataset.lobbyFlow = isSingleColumn ? "single-column" : "columns";
  if (!isSingleColumn) resetLobbyAboutButtonContact();
  syncLobbyTitlePlacement(screen, isSingleColumn);

  if (!grid || content.length !== 2) {
    resetLobbyAboutButtonContact();
    resetTitleFit(screen?.querySelector(".lobby-title"));
    resetLobbyTicketPlacement(screen, ticket);
    resetSingleColumnTitleLift(hero);
    resetSingleColumnTitleGroup(hero);
    resetSingleColumnDescriptionPlacement(hero);
    syncLobbyTextDensity(hero, footer);
    syncLobbyTicketInlinePadding(ticket);
    grid?.style.setProperty("--lobby-content-center-shift", "0px");
    return;
  }

  if (isSingleColumn) {
    resetLobbyTicketPlacement(screen, ticket);
    grid.style.setProperty("--lobby-content-center-shift", "0px");
    resetSingleColumnTitleLift(hero);
    resetSingleColumnTitleGroup(hero);
    grid.style.removeProperty("--lobby-vertical-content-gap");
    // En una sola columna el boleto está debajo; no debe limitar el título
    // como si ocupara una segunda columna lateral.
    syncLobbyTitleFit(screen, hero, null);
    syncLobbyTitlePlacement(screen, true);
    syncSingleColumnTitleGroup(hero);
    syncSingleColumnDescriptionPlacement(hero, ticket);
    syncLobbyTextDensity(hero, footer);
    syncLobbyTicketInlinePadding(ticket);
    syncSingleColumnContentGap(grid, ticket, footer);
    syncSingleColumnTicketPlacement(hero, ticket, footer);
    syncLobbyAboutButtonContact(ticket, footer);
    return;
  }

  resetSingleColumnDescriptionPlacement(hero);
  resetSingleColumnTitleLift(hero);
  resetSingleColumnTitleGroup(hero);

  if (!isColumns || !marquee || !footer) {
    resetTitleFit(screen?.querySelector(".lobby-title"));
    resetLobbyTicketPlacement(screen, ticket);
    grid.style.setProperty("--lobby-content-center-shift", "0px");
    return;
  }

  // Medimos siempre desde la posición base para no acumular el desplazamiento
  // anterior al cambiar de viewport o al cambiar la variante.
  grid.style.setProperty("--lobby-content-center-shift", "0px");
  syncLobbyTicketPlacement(screen, ticket);
  syncLobbyTicketInlinePadding(ticket);
  syncLobbyTextDensity(hero, footer);
  syncLobbyTitleFit(screen, hero, ticket);
  syncLobbyTitlePlacement(screen, false);

  const marqueeRect = marquee.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();
  const contentRects = content.map((element) => element.getBoundingClientRect());
  const contentTop = Math.min(...contentRects.map((rect) => rect.top));
  const contentBottom = Math.max(...contentRects.map((rect) => rect.bottom));
  const availableCenter = (marqueeRect.bottom + footerRect.top) / 2;
  const contentCenter = (contentTop + contentBottom) / 2;
  const contentShift = availableCenter - contentCenter;

  if (Number.isFinite(contentShift)) {
    grid.style.setProperty("--lobby-content-center-shift", `${contentShift.toFixed(2)}px`);

    // El hero puede tener un levantamiento visual propio; por eso centrar el
    // grupo completo deja el boleto bajo su centro disponible. Alineamos el
    // boleto con el punto medio real entre marquesina y pie, sin usar medidas
    // fijas del viewport.
    const centeredTicketRect = ticket.getBoundingClientRect();
    const centeredTicketMiddle = (centeredTicketRect.top + centeredTicketRect.bottom) / 2;
    const ticketShift = availableCenter - centeredTicketMiddle;
    if (Number.isFinite(ticketShift)) {
      ticket.style.setProperty("translate", `0px ${ticketShift.toFixed(2)}px`);
    }
  }
}

export function scheduleLobbyContentCenter() {
  if (lobbyCenterFrame) cancelAnimationFrame(lobbyCenterFrame);
  lobbyCenterFrame = requestAnimationFrame(syncLobbyContentCenter);
}