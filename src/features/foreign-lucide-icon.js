export function createForeignDocumentIcon(targetDocument, iconName) {
  const svg = targetDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-lucide", iconName);
  svg.setAttribute("class", `lucide lucide-${iconName}`);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.append(...getIconPaths(targetDocument, iconName));
  return svg;
}

function getIconPaths(targetDocument, iconName) {
  const definitions = {
    play: [["polygon", { points: "5 3 19 12 5 21 5 3" }]],
    pause: [["rect", { width: "4", height: "16", x: "6", y: "4" }], ["rect", { width: "4", height: "16", x: "14", y: "4" }]],
    x: [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]],
    "volume-x": [["path", { d: "M11 5 6 9H2v6h4l5 4V5z" }], ["path", { d: "m22 9-6 6" }], ["path", { d: "m16 9 6 6" }]],
    "volume-1": [["path", { d: "M11 5 6 9H2v6h4l5 4V5z" }], ["path", { d: "M15.54 8.46a5 5 0 0 1 0 7.07" }]],
    "volume-2": [["path", { d: "M11 5 6 9H2v6h4l5 4V5z" }], ["path", { d: "M16 9a5 5 0 0 1 0 6" }], ["path", { d: "M19.07 4.93a10 10 0 0 1 0 14.14" }]],
    "picture-in-picture-2": [["path", { d: "M21 3H3v18h18V3z" }], ["path", { d: "M13 13h5v5h-5z" }]],
  };
  return (definitions[iconName] || definitions.x).map(([tagName, attributes]) => {
    const path = targetDocument.createElementNS("http://www.w3.org/2000/svg", tagName);
    Object.entries(attributes).forEach(([name, value]) => path.setAttribute(name, value));
    return path;
  });
}
