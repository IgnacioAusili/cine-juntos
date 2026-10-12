export function createForeignDocumentIcon(targetDocument, iconName) {
  const iconKey = iconName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const lucide = window.lucide;
  const iconDefinition = lucide?.icons?.[iconKey];
  if (!iconDefinition || typeof lucide.createElement !== "function") {
    throw new Error(`No se encontró el icono Lucide «${iconName}».`);
  }

  const svg = targetDocument.importNode(lucide.createElement(iconDefinition), true);
  svg.setAttribute("data-lucide", iconName);
  svg.setAttribute("class", `lucide lucide-${iconName}`);
  svg.setAttribute("aria-hidden", "true");
  return svg;
}
