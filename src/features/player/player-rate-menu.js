import { dom } from "../../core/dom.js?v=20261010-file-size-refactor-02";

const RATE_SELECT_HOVER_RESET_MS = 400;
let rateMenuCloseTimer = null;
let hidePlayerSeekTooltip = () => {};

export function configureRateSelectMenu({ hideSeekTooltip } = {}) {
  if (typeof hideSeekTooltip === "function") hidePlayerSeekTooltip = hideSeekTooltip;
}

export function initializeRateSelectMenu() {
  const select = dom.playerRateSelect;
  const wrap = select?.closest(".player-rate-select");
  if (!select || !wrap || wrap.querySelector(".player-rate-trigger")) return;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "player-rate-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  menu.className = "player-rate-menu";
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  menu.addEventListener("pointerenter", hidePlayerSeekTooltip);
  menu.addEventListener("pointermove", hidePlayerSeekTooltip);

  [...select.options].forEach((option) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "player-rate-option";
    item.dataset.value = option.value;
    item.textContent = option.textContent;
    item.setAttribute("role", "option");
    item.addEventListener("click", () => {
      queueRateSelectValueChange(select, wrap, item.dataset.value);
    });
    menu.append(item);
  });

  trigger.addEventListener("click", () => {
    if (select.disabled) return;
    if (menu.hidden) openRateSelectMenu(wrap);
    else closeRateSelectMenu(wrap);
  });
  wrap.addEventListener("mouseenter", () => clearRateSelectCloseTimer());
  wrap.addEventListener("mouseleave", () => scheduleRateSelectClose(wrap));
  document.addEventListener("pointerdown", (event) => {
    if (!wrap.contains(event.target)) closeRateSelectMenu(wrap);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeRateSelectMenu(wrap);
  });

  const overlayObserver = new MutationObserver(() => {
    if (
      !dom.playerFrame?.classList.contains("player-overlay-visible")
      || dom.playerFrame.classList.contains("player-overlay-suppressed")
    ) {
      closeRateSelectMenu(wrap);
    }
  });
  overlayObserver.observe(dom.playerFrame, { attributes: true, attributeFilter: ["class"] });

  select.tabIndex = -1;
  wrap.append(trigger, menu);
}

function queueRateSelectValueChange(select, rateSelectWrap, nextValue) {
  // Primero retiramos el hover y dejamos que el navegador lo pinte; cambiar
  // el texto después evita mezclar ambas animaciones en el mismo frame.
  rateSelectWrap.classList.add("is-rate-changing");
  closeRateSelectMenu(rateSelectWrap);
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      select.value = nextValue;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      window.setTimeout(() => {
        rateSelectWrap.classList.remove("is-rate-changing");
      }, RATE_SELECT_HOVER_RESET_MS);
    });
  });
}

export function syncRateSelectMenu(rateSelectWrap) {
  const select = dom.playerRateSelect;
  const trigger = rateSelectWrap.querySelector(".player-rate-trigger");
  const menu = rateSelectWrap.querySelector(".player-rate-menu");
  if (!select || !trigger || !menu) return;

  const selectedValue = select.value;
  const selectedLabel = select.selectedOptions?.[0]?.textContent?.trim() || "";
  trigger.textContent = selectedLabel;
  trigger.disabled = select.disabled;
  trigger.setAttribute("aria-label", rateSelectWrap.dataset.tooltip || "Velocidad de reproduccion");
  menu.querySelectorAll(".player-rate-option").forEach((option) => {
    const selected = option.dataset.value === selectedValue;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });

  positionRateSelectMenu(rateSelectWrap, trigger, menu, selectedLabel);
}

function positionRateSelectMenu(rateSelectWrap, trigger, menu, selectedLabel) {
  if (!rateSelectWrap || !trigger || !menu || !selectedLabel) return;

  const selectedVisualWidth = Math.max(
    48,
    Math.ceil(
      measureRateLabelWidth(dom.playerRateSelect, selectedLabel, trigger)
      + getRateSelectChromeWidth(rateSelectWrap, trigger),
    ),
  );
  const reservedWidth = rateSelectWrap.getBoundingClientRect().width;

  // La caja exterior reserva siempre la opcion mas larga. El menu conserva su
  // propio ancho y solo cambia el ancla para seguir el centro de la etiqueta
  // activa dentro de esa caja reservada.
  menu.style.left = `${Math.max(0, reservedWidth - selectedVisualWidth / 2)}px`;
}

function openRateSelectMenu(rateSelectWrap) {
  clearRateSelectCloseTimer();
  hidePlayerSeekTooltip();
  syncRateSelectMenu(rateSelectWrap);
  const trigger = rateSelectWrap.querySelector(".player-rate-trigger");
  const menu = rateSelectWrap.querySelector(".player-rate-menu");
  if (!trigger || !menu) return;
  menu.hidden = false;
  rateSelectWrap.classList.add("is-open");
  trigger.setAttribute("aria-expanded", "true");
}

export function closeRateSelectMenu(rateSelectWrap) {
  clearRateSelectCloseTimer();
  const trigger = rateSelectWrap.querySelector(".player-rate-trigger");
  const menu = rateSelectWrap.querySelector(".player-rate-menu");
  if (!trigger || !menu) return;
  menu.hidden = true;
  rateSelectWrap.classList.remove("is-open");
  trigger.setAttribute("aria-expanded", "false");
}

function scheduleRateSelectClose(rateSelectWrap) {
  clearRateSelectCloseTimer();
  if (rateSelectWrap.querySelector(".player-rate-menu")?.hidden) return;
  rateMenuCloseTimer = window.setTimeout(() => closeRateSelectMenu(rateSelectWrap), 1200);
}

function clearRateSelectCloseTimer() {
  if (rateMenuCloseTimer !== null) window.clearTimeout(rateMenuCloseTimer);
  rateMenuCloseTimer = null;
}

function measureRateLabelWidth(select, label, reference = null) {
  if (!select || !label) return 0;
  const referenceStyles = getComputedStyle(reference || select);
  const measure = document.createElement("span");
  measure.textContent = label;
  measure.setAttribute("aria-hidden", "true");
  measure.style.cssText = [
    "position: absolute",
    "visibility: hidden",
    "white-space: nowrap",
    `font-family: ${referenceStyles.fontFamily}`,
    `font-size: ${referenceStyles.fontSize}`,
    `font-weight: ${referenceStyles.fontWeight}`,
    `letter-spacing: ${referenceStyles.letterSpacing}`,
  ].join(";");
  document.body.append(measure);
  const textWidth = measure.getBoundingClientRect().width;
  measure.remove();
  return textWidth;
}

export function syncRateSelectWidth(rateSelectWrap) {
  const select = dom.playerRateSelect;
  const trigger = rateSelectWrap?.querySelector(".player-rate-trigger");
  if (!select || !rateSelectWrap || !trigger) return;

  syncRateSelectLayoutWidth(select, rateSelectWrap, trigger);
}

function syncRateSelectLayoutWidth(select, rateSelectWrap, trigger) {
  const optionsSignature = [...select.options]
    .map((option) => option.textContent.trim())
    .join("\u001f");
  const referenceStyles = getComputedStyle(trigger || select);
  const styleSignature = [
    referenceStyles.fontFamily,
    referenceStyles.fontSize,
    referenceStyles.fontWeight,
    referenceStyles.letterSpacing,
  ].join("|");
  const measurementKey = `${optionsSignature}|${styleSignature}`;
  if (
    rateSelectWrap.dataset.rateLayoutMeasurement === measurementKey
    && rateSelectWrap.dataset.rateLayoutWidth
  ) return;

  const chromeWidth = getRateSelectChromeWidth(rateSelectWrap, trigger);
  const widestLabel = [...select.options].reduce(
    (widest, option) => Math.max(
      widest,
      measureRateLabelWidth(select, option.textContent.trim(), trigger),
    ),
    0,
  );
  const layoutWidth = Math.max(48, Math.ceil(widestLabel + chromeWidth));
  rateSelectWrap.style.setProperty("--player-rate-layout-width", `${layoutWidth}px`);
  rateSelectWrap.style.removeProperty("--player-rate-select-width");
  rateSelectWrap.style.removeProperty("width");
  rateSelectWrap.dataset.rateLayoutMeasurement = measurementKey;
  rateSelectWrap.dataset.rateLayoutWidth = String(layoutWidth);
}

function getRateSelectChromeWidth(rateSelectWrap, trigger) {
  const triggerStyles = trigger ? getComputedStyle(trigger) : null;
  const paddingWidth = triggerStyles
    ? parseFloat(triggerStyles.paddingLeft) + parseFloat(triggerStyles.paddingRight)
    : 28;
  const borderStyles = getComputedStyle(rateSelectWrap);
  const borderWidth = parseFloat(borderStyles.borderLeftWidth)
    + parseFloat(borderStyles.borderRightWidth);
  return paddingWidth + borderWidth;
}
