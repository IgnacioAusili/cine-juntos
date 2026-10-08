export function shouldAnchorChatCollapseHandleInHeader({
  workspace,
  chatArea,
  chatHeader,
  isStacked,
}) {
  if (!workspace || !chatArea || !chatHeader) return false;

  const chatRect = chatArea.getBoundingClientRect();
  if (chatRect.width <= 0 || chatRect.height <= 0) return false;
  if (isStacked) return true;

  const workspaceRect = workspace.getBoundingClientRect();
  if (workspaceRect.width <= 0) return false;

  return (
    chatRect.left <= workspaceRect.left + 1
    && chatRect.right >= workspaceRect.right - 1
  );
}
