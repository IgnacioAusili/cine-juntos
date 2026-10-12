export function syncComponentStackShellInsets(appShell, sessionView, workspace) {
  if (!appShell || !sessionView || !workspace) return;

  const shellStyle = getComputedStyle(appShell);
  const bottomPadding = Number.parseFloat(shellStyle.paddingBottom);
  const topPadding = Number.parseFloat(shellStyle.paddingTop);
  const inset = Number.isFinite(bottomPadding) ? Math.max(0, bottomPadding) : 0;
  const sessionBounds = sessionView.getBoundingClientRect();
  const viewportWidth = window.visualViewport?.width || window.innerWidth;
  const sessionTouchesViewportEdges = Boolean(
    sessionBounds.width > 0
    && Math.abs(sessionBounds.left) <= 1
    && Math.abs(sessionBounds.right - viewportWidth) <= 1,
  );
  // El padding superior protege el topbar; repetirlo sobre el panel edge-to-edge
  // deja una franja vacía delante del primer panel de video.
  const measuredTopInset = Number.isFinite(topPadding) ? Math.max(0, topPadding) : 0;
  const topInset = sessionTouchesViewportEdges ? 0 : measuredTopInset;
  const insetValue = `${inset}px`;
  const topInsetValue = `${topInset}px`;

  if (
    workspace.style.getPropertyValue("--component-stack-viewport-bottom-inset")
    !== insetValue
  ) {
    workspace.style.setProperty("--component-stack-viewport-bottom-inset", insetValue);
  }

  if (
    workspace.style.getPropertyValue("--component-stack-viewport-top-inset")
    !== topInsetValue
  ) {
    workspace.style.setProperty("--component-stack-viewport-top-inset", topInsetValue);
  }
}
