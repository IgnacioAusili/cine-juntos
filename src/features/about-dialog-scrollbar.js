const TRACK_SELECTOR = ".about-dialog-scrollbar";
const THUMB_SELECTOR = ".about-dialog-scrollbar-thumb";

function syncScrollbar(dialog, card, track, thumb) {
  if (!dialog.open) {
    track.hidden = true;
    return;
  }

  const maxScroll = Math.max(0, card.scrollHeight - card.clientHeight);
  track.hidden = maxScroll <= 0;
  if (track.hidden) return;

  const trackHeight = track.clientHeight;
  const thumbHeight = Math.min(128, trackHeight);
  const travel = Math.max(0, trackHeight - thumbHeight);
  const progress = Math.min(1, Math.max(0, card.scrollTop / maxScroll));

  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translateY(${travel * progress}px)`;
}

export function wireAboutDialogScrollbar() {
  const dialog = document.querySelector("#aboutDialog");
  const card = dialog?.querySelector(".about-dialog-card");
  const track = dialog?.querySelector(TRACK_SELECTOR);
  const thumb = track?.querySelector(THUMB_SELECTOR);
  if (!dialog || !card || !track || !thumb) return;

  let frame = 0;
  let hideTimer = 0;
  const scheduleSync = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      syncScrollbar(dialog, card, track, thumb);
    });
  };

  const showWhileScrolling = () => {
    track.classList.add("is-visible");
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      track.classList.remove("is-visible");
    }, 700);
  };

  card.addEventListener("scroll", () => {
    showWhileScrolling();
    scheduleSync();
  }, { passive: true });
  window.addEventListener("resize", scheduleSync, { passive: true });
  dialog.addEventListener("close", () => {
    window.clearTimeout(hideTimer);
    track.classList.remove("is-visible");
    track.hidden = true;
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#aboutButton")) scheduleSync();
  }, { passive: true });

  if (window.ResizeObserver) {
    const observer = new ResizeObserver(scheduleSync);
    observer.observe(card);
  }

  scheduleSync();
}
