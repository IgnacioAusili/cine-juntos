export function syncSingleColumnDescriptionPlacement(hero, ticket) {
  if (!hero || !ticket) return;

  // Medimos desde cero para no acumular el desplazamiento al redimensionar.
  hero.style.setProperty("--lobby-description-separator-shift", "0px");

  const title = hero.querySelector(".lobby-title");
  const description = hero.querySelector(".lobby-description");
  if (!title || !description) return;

  const descriptionWidth = Math.max(hero.clientWidth, ticket.clientWidth);
  if (descriptionWidth > 0) {
    description.style.setProperty("--lobby-description-fit-width", `${descriptionWidth.toFixed(2)}px`);
  }

  const separatorStyle = getComputedStyle(hero, "::before");
  const separatorTop = Number.parseFloat(separatorStyle.top);
  const separatorHeight = Number.parseFloat(separatorStyle.height);
  if (!Number.isFinite(separatorTop) || !Number.isFinite(separatorHeight) || separatorHeight <= 0) return;

  const heroRect = hero.getBoundingClientRect();
  const titleRect = title.getBoundingClientRect();
  const descriptionRect = description.getBoundingClientRect();
  const ticketRect = ticket.getBoundingClientRect();
  const separatorBottom = heroRect.top + separatorTop + separatorHeight;
  const topGap = descriptionRect.top - titleRect.bottom;
  const bottomGap = ticketRect.top - separatorBottom;
  const shift = (bottomGap - topGap) / 2;

  if (Number.isFinite(shift)) {
    hero.style.setProperty("--lobby-description-separator-shift", `${shift.toFixed(2)}px`);
  }
}

export function resetLobbyAboutButtonContact() {
  delete document.body.dataset.lobbyAboutContact;
}

export function syncLobbyAboutButtonContact(ticket, footer) {
  const button = footer?.querySelector(".lobby-about-button");
  if (!ticket || !button || button.getClientRects().length === 0) {
    resetLobbyAboutButtonContact();
    return;
  }

  const renderedScale = Number.parseFloat(getComputedStyle(button).scale);
  const scale = Number.isFinite(renderedScale) && renderedScale > 0 ? renderedScale : 1;
  const buttonRect = button.getBoundingClientRect();
  const centerX = (buttonRect.left + buttonRect.right) / 2;
  const centerY = (buttonRect.top + buttonRect.bottom) / 2;
  const unscaledWidth = buttonRect.width / scale;
  const unscaledHeight = buttonRect.height / scale;
  const baseButtonRect = {
    left: centerX - unscaledWidth / 2,
    right: centerX + unscaledWidth / 2,
    top: centerY - unscaledHeight / 2,
    bottom: centerY + unscaledHeight / 2,
  };
  const ticketRect = ticket.getBoundingClientRect();
  const contactTolerance = 1;
  const touchesButton = ticketRect.left <= baseButtonRect.right + contactTolerance
    && ticketRect.right >= baseButtonRect.left - contactTolerance
    && ticketRect.top <= baseButtonRect.bottom + contactTolerance
    && ticketRect.bottom >= baseButtonRect.top - contactTolerance;

  if (touchesButton) document.body.dataset.lobbyAboutContact = "true";
  else resetLobbyAboutButtonContact();
}

export function syncSingleColumnContentGap(grid, ticket, footer) {
  if (!grid || !ticket || !footer) return;

  // Cada ciclo parte de la separación declarada por CSS y solo la reduce si
  // el contenido real invade el espacio ocupado por el footer fijo.
  grid.style.removeProperty("--lobby-vertical-content-gap");
  const baseGap = Number.parseFloat(getComputedStyle(grid).rowGap);
  if (!Number.isFinite(baseGap)) return;

  const ticketRect = ticket.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();
  const overlap = ticketRect.bottom - footerRect.top;
  if (overlap <= 0) return;

  const gap = Math.max(0, baseGap - overlap);
  grid.style.setProperty("--lobby-vertical-content-gap", `${gap.toFixed(2)}px`);
}

export function syncSingleColumnTicketPlacement(hero, ticket, footer) {
  if (!hero || !ticket || !footer) return;

  const fitProperties = [
    "--lobby-ticket-fit-height",
    "--lobby-ticket-fit-stub-height",
    "--lobby-ticket-fit-padding-top",
    "--lobby-ticket-fit-padding-bottom",
    "--lobby-ticket-fit-body-gap",
    "--lobby-ticket-fit-head-padding",
    "--lobby-ticket-fit-fields-gap",
    "--lobby-ticket-fit-control-height",
    "--lobby-ticket-fit-action-height",
    "--lobby-ticket-fit-stub-inset",
  ];
  fitProperties.forEach((property) => ticket.style.removeProperty(property));

  const body = ticket.querySelector(".lobby-ticket-body");
  const stub = ticket.querySelector(".lobby-ticket-stub");
  const head = ticket.querySelector(".lobby-ticket-head");
  const fields = ticket.querySelector(".lobby-fields");
  const controls = [...(fields?.querySelectorAll('input[type="text"]') || [])];
  const actionButtons = [...ticket.querySelectorAll(".lobby-actions > .button")];
  const stubRect = stub?.getBoundingClientRect();
  const hasTopStub = Boolean(stubRect && stubRect.width > stubRect.height);
  if (body && hasTopStub) {
    const sidePadding = Number.parseFloat(getComputedStyle(body).paddingInlineStart);
    if (Number.isFinite(sidePadding)) {
      ticket.style.setProperty("--lobby-ticket-fit-padding-top", `${sidePadding.toFixed(2)}px`);
    }
  }
  const heroRect = hero.getBoundingClientRect();
  const baseTicketHeight = ticket.getBoundingClientRect().height;
  const footerRect = footer.getBoundingClientRect();
  const legalText = footer.querySelector(".lobby-disclaimer");
  const lowerVisibleBoundary = legalText?.getBoundingClientRect().top ?? footerRect.top;
  const availableHeight = Math.max(0, lowerVisibleBoundary - heroRect.bottom);
  const minimumGap = Math.min(9, availableHeight / 4);
  const targetTicketHeight = Math.min(
    baseTicketHeight,
    Math.max(0, availableHeight - minimumGap * 2),
  );
  let remainingCompression = Math.max(0, baseTicketHeight - targetTicketHeight);

  if (remainingCompression > 0) {
    // Primero reducimos el boleto completo (la franja naranja se acorta con él).
    ticket.style.setProperty("--lobby-ticket-fit-height", `${targetTicketHeight.toFixed(2)}px`);
    if (hasTopStub && stubRect) {
      const stubReduction = Math.min(6, remainingCompression * 0.18);
      ticket.style.setProperty(
        "--lobby-ticket-fit-stub-height",
        `${Math.max(28, stubRect.height - stubReduction).toFixed(2)}px`,
      );
      remainingCompression -= stubReduction;
    }
    const stubInset = Math.min(10, (baseTicketHeight - targetTicketHeight) / 2);
    if (stubInset > 0) {
      ticket.style.setProperty("--lobby-ticket-fit-stub-inset", `${stubInset.toFixed(2)}px`);
    }

    if (body && head && fields && controls.length) {
      const bodyStyle = getComputedStyle(body);
      const headStyle = getComputedStyle(head);
      const fieldsStyle = getComputedStyle(fields);
      const topPadding = Number.parseFloat(bodyStyle.paddingTop) || 0;
      const bottomPadding = Number.parseFloat(bodyStyle.paddingBottom) || 0;
      const bodyGap = Number.parseFloat(bodyStyle.rowGap) || 0;
      const headPadding = Number.parseFloat(headStyle.paddingBottom) || 0;
      const fieldsGap = Number.parseFloat(fieldsStyle.rowGap) || 0;
      const controlHeight = Number.parseFloat(getComputedStyle(controls[0]).height) || 0;
      const actionHeight = Number.parseFloat(getComputedStyle(actionButtons[0]).height) || 0;
      const fieldsGapCount = Math.max(0, fields.children.length - 1);

      // Después del alto exterior, quitamos relleno vertical y solo luego
      // reducimos separaciones y controles si todavía no alcanza.
      const topPaddingCapacity = Math.max(0, topPadding - Math.min(4, topPadding));
      const bottomPaddingCapacity = Math.max(0, bottomPadding - Math.min(4, bottomPadding));
      const paddingCapacity = (hasTopStub ? 0 : topPaddingCapacity) + bottomPaddingCapacity;
      const paddingReduction = Math.min(remainingCompression, paddingCapacity);
      if (paddingReduction > 0 && paddingCapacity > 0) {
        const effectiveTopPaddingCapacity = hasTopStub ? 0 : topPaddingCapacity;
        const topReduction = paddingReduction * (effectiveTopPaddingCapacity / paddingCapacity);
        const bottomReduction = paddingReduction - topReduction;
        ticket.style.setProperty(
          "--lobby-ticket-fit-padding-top",
          `${(topPadding - topReduction).toFixed(2)}px`,
        );
        ticket.style.setProperty(
          "--lobby-ticket-fit-padding-bottom",
          `${(bottomPadding - bottomReduction).toFixed(2)}px`,
        );
        remainingCompression -= paddingReduction;
      }

      const reduceRepeatedSpace = (property, base, minimum, count = 1) => {
        if (remainingCompression <= 0 || count <= 0) return;
        const perItemCapacity = Math.max(0, base - minimum);
        const perItemReduction = Math.min(perItemCapacity, remainingCompression / count);
        if (perItemReduction <= 0) return;
        ticket.style.setProperty(property, `${(base - perItemReduction).toFixed(2)}px`);
        remainingCompression -= perItemReduction * count;
      };

      reduceRepeatedSpace(
        "--lobby-ticket-fit-body-gap",
        bodyGap,
        Math.min(2, bodyGap),
      );
      reduceRepeatedSpace(
        "--lobby-ticket-fit-head-padding",
        headPadding,
        Math.min(0, headPadding),
      );
      reduceRepeatedSpace(
        "--lobby-ticket-fit-fields-gap",
        fieldsGap,
        Math.min(2, fieldsGap),
        fieldsGapCount,
      );
      reduceRepeatedSpace(
        "--lobby-ticket-fit-control-height",
        controlHeight,
        Math.min(28, controlHeight),
        controls.length,
      );
      reduceRepeatedSpace(
        "--lobby-ticket-fit-action-height",
        actionHeight,
        Math.min(34, actionHeight),
        actionButtons.length,
      );
    }
  }

  const ticketRect = ticket.getBoundingClientRect();
  const freeSpace = lowerVisibleBoundary - heroRect.bottom - ticketRect.height;
  const targetTicketTop = heroRect.bottom + Math.max(0, freeSpace / 2);

  const ticketShift = targetTicketTop - ticketRect.top;
  if (Number.isFinite(ticketShift)) {
    ticket.style.setProperty("translate", `0px ${ticketShift.toFixed(2)}px`);
  }
}
