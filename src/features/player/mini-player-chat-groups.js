export const mirroredSystemGroupStates = new WeakMap();
const miniSystemGroupAnimations = new WeakMap();

export function normalizeMiniSystemGroupState(container) {
  container?.querySelectorAll(".message.system").forEach((systemMessage) => {
    const targets = [systemMessage, ...systemMessage.querySelectorAll("*")];
    targets.forEach((target) => {
      target.classList.remove("system-group-transitioning");
      target.getAnimations?.().forEach((animation) => animation.cancel());
      target.style.removeProperty("opacity");
      target.style.removeProperty("transform");
    });
  });
}

export function setMiniSystemGroupVisibility(toggle, expanded) {
  const anchor = toggle.closest(".message.system");
  if (!anchor) return;

  const items = [anchor];
  let item = anchor.previousElementSibling;
  while (item?.classList.contains("message") && item.classList.contains("system")) {
    items.unshift(item);
    item = item.previousElementSibling;
  }

  item = anchor.nextElementSibling;
  while (item?.classList.contains("message") && item.classList.contains("system")) {
    items.push(item);
    item = item.nextElementSibling;
  }

  items.forEach((systemItem, index) => {
    systemItem.classList.toggle(
      "system-group-collapsed-item",
      !expanded && index < items.length - 1,
    );
  });

  const visibleItem = expanded ? items[0] : items.at(-1);
  const row = visibleItem?.querySelector(".system-message-row") || visibleItem;
  if (row && toggle.parentElement !== row) row.append(toggle);
}

export function animateMiniSystemGroupTransition(toggle, expanded) {
  const anchor = toggle.closest(".message.system");
  if (!anchor) return;

  const previousTransition = miniSystemGroupAnimations.get(anchor);
  previousTransition?.animations.forEach((animation) => animation.cancel());

  const items = [anchor];
  let item = anchor.previousElementSibling;
  while (item?.classList.contains("message") && item.classList.contains("system")) {
    items.unshift(item);
    item = item.previousElementSibling;
  }

  item = anchor.nextElementSibling;
  while (item?.classList.contains("message") && item.classList.contains("system")) {
    items.push(item);
    item = item.nextElementSibling;
  }

  const animatedItems = expanded ? items : [items.at(-1)];
  items.forEach((systemItem) => systemItem.classList.add("system-group-transitioning"));
  const animations = [];
  animatedItems.forEach((systemItem) => {
    const row = systemItem?.querySelector(".system-message-row") || systemItem;
    const animation = row?.animate(
      expanded
        ? [
            { opacity: 0.35, transform: "translateY(-3px)" },
            { opacity: 1, transform: "translateY(0)" },
          ]
        : [
            { opacity: 0.68, transform: "translateY(-2px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
      { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    if (animation) animations.push(animation);
  });
  const transition = { animations };
  miniSystemGroupAnimations.set(anchor, transition);
  Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => {
    if (miniSystemGroupAnimations.get(anchor) !== transition) return;
    items.forEach((systemItem) => systemItem.classList.remove("system-group-transitioning"));
    miniSystemGroupAnimations.delete(anchor);
  });
}
