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
