export function getRenderableMessageImages(message, messageText = "") {
  const images = Array.isArray(message?.images)
    ? message.images.filter(Boolean)
    : message?.image
      ? [message.image]
      : [];
  if (images.length) return images;
  if (isStandaloneImageText(messageText)) return [messageText.trim()];
  return [];
}

export function isStandaloneImageText(text) {
  const trimmed = String(text || "").trim();
  return trimmed.startsWith("data:image/") && trimmed.includes("base64,");
}

export function appendMessageMedia(container, images, isStandalone = false) {
  if (!container || !Array.isArray(images) || !images.length) return null;
  const strip = document.createElement("div");
  strip.className = 'message__media-strip';
  if (isStandalone) strip.classList.add('message__media-strip--standalone');

  for (const imageUrl of images.slice(0, 2)) {
    const link = document.createElement("a");
    link.className = 'message__media-link';
    link.href = imageUrl;
    link.target = "_blank";
    link.rel = "noreferrer";

    const imgElement = document.createElement("img");
    imgElement.className = 'message__media';
    imgElement.src = imageUrl;
    imgElement.alt = "Imagen adjunta";
    imgElement.loading = "lazy";

    link.append(imgElement);
    strip.append(link);
  }

  container.append(strip);
  return strip;
}
