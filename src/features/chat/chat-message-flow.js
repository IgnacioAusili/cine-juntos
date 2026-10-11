export function getPreviousRenderableMessage(container) {
  const children = Array.from(container.children);
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (!child.classList.contains("message")) continue;
    if (child.classList.contains("system-group-collapsed-item")) continue;
    return child;
  }
  return null;
}
export function getFirstRenderableMessage(container) {
  const children = Array.from(container.children);
  for (const child of children) {
    if (!child.classList.contains("message")) continue;
    if (child.classList.contains("system-group-collapsed-item")) continue;
    return child;
  }
  return null;
}

export function removeContinuationAuthorName(message) {
  const name = message?.querySelector(".message-meta-name");
  if (!name) return;
  const meta = name.parentElement;
  name.remove();
  if (meta && !meta.children.length) meta.remove();
}
