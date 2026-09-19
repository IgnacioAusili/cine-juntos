const TICKET_EDGE_MARGIN_PX = 5;
const TICKET_TOP_TRIGGER_MARGIN_PX = 12;

export function resetLobbyTicketPlacement(screen, ticket) {
  document.body.removeAttribute("data-lobby-ticket-stub");
  ticket?.style.removeProperty("translate");
  screen?.style.removeProperty("--lobby-ticket-right-shift");
}

export function syncLobbyTicketPlacement(screen, ticket) {
  if (!screen || !ticket) return;

  // Medir sin el desplazamiento anterior evita acumular translate al redimensionar.
  ticket.style.removeProperty("translate");
  const screenRect = screen.getBoundingClientRect();
  const ticketRect = ticket.getBoundingClientRect();
  const rightSpace = screenRect.right - ticketRect.right;
  const stubMode = rightSpace < TICKET_TOP_TRIGGER_MARGIN_PX ? "top" : "side";
  const rightShift = Math.max(0, rightSpace - TICKET_EDGE_MARGIN_PX);

  document.body.dataset.lobbyTicketStub = stubMode;
  ticket.style.setProperty("translate", `${rightShift.toFixed(2)}px 0`);
}

export function syncLobbyTitlePlacement(screen, isSingleColumn) {
  const hero = screen?.querySelector(".lobby-hero");
  const title = hero?.querySelector(".lobby-title");
  const icon = hero?.querySelector(".lobby-title-icon");
  if (!hero) return;
  if (!isSingleColumn || !title || !icon) {
    delete hero.dataset.titlePlacement;
    icon?.style.removeProperty("position");
    icon?.style.removeProperty("left");
    icon?.style.removeProperty("top");
    return;
  }

  hero.dataset.titlePlacement = "centered";
  icon.style.removeProperty("left");
  icon.style.removeProperty("top");
  const heroRect = hero.getBoundingClientRect();
  const titleRect = title.getBoundingClientRect();
  const iconRect = icon.getBoundingClientRect();
  const gap = Number.parseFloat(getComputedStyle(hero).columnGap) || 14;
  icon.style.setProperty("left", `${titleRect.left - heroRect.left - iconRect.width - gap}px`);
  icon.style.setProperty("top", `${titleRect.top - heroRect.top + (titleRect.height - iconRect.height) / 2}px`);
}
