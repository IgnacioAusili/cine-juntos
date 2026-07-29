import {
  CHAT_VIDEO_PREVIEW_MAX_SECONDS,
  REMOTE_IMAGE_EXTENSIONS,
  REMOTE_VIDEO_EXTENSIONS,
} from "../../core/utils.js";

export function appendMessageContent(container, text) {
  const trimmedText = String(text || "").trim();

  if (trimmedText.startsWith("data:image/") && trimmedText.includes("base64,")) {
    const link = document.createElement("a");
    link.className = "message-media-link";
    link.href = trimmedText;
    link.target = "_blank";

    const img = document.createElement("img");
    img.className = "message-media";
    img.src = trimmedText;
    img.alt = "Imagen base64";
    img.loading = "lazy";

    link.append(img);
    container.append(link);
    return;
  }

  const firstUrl = findFirstUrl(text);
  const explicitImageUrl = parseExplicitImageUrl(text);
  const imageUrl = explicitImageUrl || (firstUrl && isRemoteImageUrl(firstUrl) ? firstUrl : "");
  const videoUrl = firstUrl && isRemoteVideoUrl(firstUrl) ? firstUrl : "";

  if (!firstUrl) {
    const textNode = document.createElement("div");
    const isEmojiOnly = isEmojiOnlyText(trimmedText);
    textNode.className = `message-text${isEmojiOnly ? " message-text--emoji" : ""}`;
    textNode.textContent = trimmedText;
    container.append(textNode);
    if (isEmojiOnly) {
      container.classList.add("message-content--emoji");
      container.parentElement?.classList.add("message-bubble--emoji");
    }
    return;
  }

  const textWithoutUrl = trimmedText.replace(firstUrl, "").trim();
  if (textWithoutUrl) {
    const textNode = document.createElement("div");
    const isEmojiOnly = isEmojiOnlyText(textWithoutUrl);
    textNode.className = `message-text${isEmojiOnly ? " message-text--emoji" : ""}`;
    textNode.textContent = textWithoutUrl;
    container.append(textNode);
    if (isEmojiOnly && container.childElementCount === 1) {
      container.classList.add("message-content--emoji");
      container.parentElement?.classList.add("message-bubble--emoji");
    }
  }

  if (videoUrl) {
    appendVideoPreview(container, videoUrl, firstUrl);
    return;
  }

  const link = document.createElement("a");
  const shouldAttemptImagePreview = Boolean(!videoUrl && firstUrl);
  link.className = shouldAttemptImagePreview ? "message-media-link" : "message-link";
  link.href = firstUrl;
  link.target = "_blank";
  link.rel = "noreferrer";

  if (!shouldAttemptImagePreview) {
    link.textContent = firstUrl;
    container.append(link);
    return;
  }

  const image = document.createElement("img");
  image.className = "message-media";
  image.src = imageUrl || firstUrl;
  image.alt = "Imagen enviada";
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.addEventListener(
    "error",
    () => {
      link.className = "message-link";
      link.replaceChildren();
      link.textContent = firstUrl;
    },
    { once: true },
  );

  link.append(image);
  container.append(link);
}

export function truncateText(text, maxLength) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function findFirstUrl(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s<>"']+/gi) || [];
  for (const match of matches) {
    const candidate = match.replace(/[),.;]+$/g, "");
    try {
      return new URL(candidate).toString();
    } catch {
      continue;
    }
  }
  return "";
}

function parseExplicitImageUrl(text) {
  const match = String(text || "")
    .trim()
    .match(/^(?:img|image)\s*=\s*(https?:\/\/\S+)$/i);
  if (!match) return "";
  const candidate = match[1].replace(/[),.;]+$/g, "");
  try {
    return new URL(candidate).toString();
  } catch {
    return "";
  }
}

function isEmojiOnlyText(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  return /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}\u200D\uFE0F\s]+$/u.test(value);
}

function appendVideoPreview(container, videoUrl, fallbackUrl) {
  const link = document.createElement("a");
  link.className = "message-link";
  link.href = fallbackUrl || videoUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = fallbackUrl || videoUrl;
  container.append(link);

  const probe = document.createElement("video");
  let settled = false;
  probe.preload = "metadata";
  probe.src = videoUrl;

  const cleanupProbe = () => {
    if (settled) return;
    settled = true;
    probe.removeAttribute("src");
    probe.load?.();
  };

  const renderVideo = () => {
    if (settled || !link.isConnected) return;
    if (!Number.isFinite(probe.duration) || probe.duration <= 0) {
      cleanupProbe();
      return;
    }
    if (probe.duration > CHAT_VIDEO_PREVIEW_MAX_SECONDS) {
      cleanupProbe();
      return;
    }

    const video = document.createElement("video");
    video.className = "message-video";
    video.src = videoUrl;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    link.replaceWith(video);
    cleanupProbe();
  };

  probe.addEventListener("loadedmetadata", renderVideo, { once: true });
  probe.addEventListener("error", cleanupProbe, { once: true });
  window.setTimeout(cleanupProbe, 4000);
  probe.load();
}

function isRemoteImageUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(url.protocol)) return false;
  if (isLocalHostname(url.hostname)) return false;
  const path = url.pathname.toLowerCase();
  return REMOTE_IMAGE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function isRemoteVideoUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(url.protocol)) return false;
  if (isLocalHostname(url.hostname)) return false;
  const path = url.pathname.toLowerCase();
  return REMOTE_VIDEO_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function isLocalHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!host || host === "localhost" || host === "0.0.0.0" || host === "::1") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || /^169\.254\./.test(host)) return true;
  return false;
}
