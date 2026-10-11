import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";

const scrollbarDragState = new WeakMap();

export function wireComposerScrollbar(input) {
  if (!input || input.dataset.composerScrollbarBound === "true") return;
  input.dataset.composerScrollbarBound = "true";

  const update = () => syncComposerScrollbar(input);
  input.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  update();
}

export function wireChatScrollbar(messagesContainer) {
  if (!messagesContainer || messagesContainer.dataset.chatScrollbarBound === "true") return;
  messagesContainer.dataset.chatScrollbarBound = "true";

  const update = () => syncChatScrollbar(messagesContainer);
  messagesContainer.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  window.addEventListener("chat-layout-settled", update, { passive: true });
  wireChatScrollbarDragging(messagesContainer);
  update();
}

function wireChatScrollbarDragging(messagesContainer) {
  if (!messagesContainer || messagesContainer.dataset.chatScrollbarDragBound === "true") return;
  messagesContainer.dataset.chatScrollbarDragBound = "true";

  const shell = messagesContainer.closest(".messages-wrap");
  const track = shell?.querySelector(".chat-scrollbar");
  if (!shell || !track) return;

  const getThumb = () => shell.querySelector(".chat-scrollbar-thumb");

  const updateFromPointer = (clientY) => {
    const thumb = getThumb();
    if (!thumb) return;

    const overflow = messagesContainer.scrollHeight - messagesContainer.clientHeight;
    if (overflow <= 0) return;

    const trackRect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const thumbHeight = Math.max(12, Math.round(thumbRect.height || 12));
    const maxOffset = Math.max(0, trackRect.height - thumbHeight);
    const dragState = scrollbarDragState.get(messagesContainer);
    const offsetWithinThumb = dragState?.offsetWithinThumb ?? thumbHeight / 2;
    const nextTop = Math.max(0, Math.min(maxOffset, clientY - trackRect.top - offsetWithinThumb));
    const scrollRatio = maxOffset <= 0 ? 0 : nextTop / maxOffset;
    messagesContainer.scrollTop = scrollRatio * overflow;
    syncChatScrollbar(messagesContainer);
  };

  const stopDragging = (event) => {
    const dragState = scrollbarDragState.get(messagesContainer);
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    scrollbarDragState.delete(messagesContainer);
    try {
      track.releasePointerCapture(event.pointerId);
    } catch {
      // Ignorado: el puntero ya pudo haberse liberado.
    }
    track.classList.remove("is-dragging");
    shell.classList.remove("is-dragging");
  };

  track.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;

    const thumb = getThumb();
    if (!thumb) return;

    const overflow = messagesContainer.scrollHeight - messagesContainer.clientHeight;
    if (overflow <= 0) return;

    const thumbRect = thumb.getBoundingClientRect();
    const offsetWithinThumb = event.target === thumb || thumb.contains(event.target)
      ? Math.max(0, Math.min(thumbRect.height, event.clientY - thumbRect.top))
      : Math.max(0, thumbRect.height / 2);

    scrollbarDragState.set(messagesContainer, {
      pointerId: event.pointerId,
      offsetWithinThumb,
    });

    track.classList.add("is-dragging");
    shell.classList.add("is-dragging");

    try {
      track.setPointerCapture(event.pointerId);
    } catch {
      // Ignorado: algunos navegadores no permiten capturar ciertos punteros.
    }

    event.preventDefault();
    updateFromPointer(event.clientY);
  });

  track.addEventListener("pointermove", (event) => {
    const dragState = scrollbarDragState.get(messagesContainer);
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    event.preventDefault();
    updateFromPointer(event.clientY);
  });

  track.addEventListener("pointerup", stopDragging);
  track.addEventListener("pointercancel", stopDragging);
  track.addEventListener("lostpointercapture", stopDragging);
}

export function syncChatScrollbar(messagesContainer) {
  const shell = messagesContainer?.closest(".messages-wrap");
  const track = shell?.querySelector(".chat-scrollbar");
  const thumb = shell?.querySelector(".chat-scrollbar-thumb");
  if (!shell || !track || !thumb) return;

  const isLayoutTransitioning = dom.sessionView?.classList.contains("chat-layout-transitioning")
    || dom.sessionView?.classList.contains("chat-dock-switching");
  if (isLayoutTransitioning) {
    shell.removeAttribute("data-scrollbar-visible");
    thumb.style.height = "";
    thumb.style.transform = "";
    return;
  }

  const overflow = messagesContainer.scrollHeight - messagesContainer.clientHeight;
  if (overflow <= 1) {
    shell.removeAttribute("data-scrollbar-visible");
    thumb.style.height = "";
    thumb.style.transform = "";
    return;
  }

  const trackHeight = Math.max(0, track.clientHeight);
  const ratio = messagesContainer.clientHeight / messagesContainer.scrollHeight;
  const thumbHeight = Math.max(12, Math.min(trackHeight, Math.round(trackHeight * ratio)));
  const maxOffset = Math.max(0, trackHeight - thumbHeight);
  const scrollRatio = messagesContainer.scrollTop / overflow;
  const top = Math.round(maxOffset * scrollRatio);

  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translateY(${top}px)`;
  shell.setAttribute("data-scrollbar-visible", "true");
}

export function syncComposerScrollbar(input) {
  const shell = input?.closest(".textarea-shell");
  const thumb = shell?.querySelector(".composer-scrollbar-thumb");
  if (!shell || !thumb) return;

  const overflow = input.scrollHeight - input.clientHeight;
  if (overflow <= 1) {
    shell.removeAttribute("data-scrollbar-visible");
    thumb.style.height = "";
    thumb.style.transform = "";
    return;
  }

  const track = shell.querySelector(".composer-scrollbar");
  const trackHeight = Math.max(0, track?.clientHeight || 0);
  const ratio = input.clientHeight / input.scrollHeight;
  const thumbHeight = Math.max(12, Math.min(trackHeight, Math.round(trackHeight * ratio)));
  const maxOffset = Math.max(0, trackHeight - thumbHeight);
  const scrollRatio = input.scrollTop / overflow;
  const top = Math.round(maxOffset * scrollRatio);

  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translateY(${top}px)`;
  shell.setAttribute("data-scrollbar-visible", "true");
}
