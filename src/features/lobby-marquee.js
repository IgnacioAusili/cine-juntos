const LOBBY_MARQUEE_EXTRA_MESSAGES = [
  "Dale play",
  "¿Qué vemos hoy?",
  "Estreno",
  "Luz, cámara, acción",
  "El plan es ver una peli",
  "¿Te sumás a la función?",
  "Sin spoilers",
  "Una más y nos vamos",
  "Que empiece la historia",
  "Ponete cómodo",
  "Maratón",
  "Suspenso",
  "Ciencia ficción",
];
const LOBBY_MARQUEE_SPEED_PX_PER_SECOND = 26;

export function wireLobbyMarqueeContent(screen) {
  const track = screen?.querySelector(".lobby-marquee-track");
  const sets = [...(track?.querySelectorAll(".marquee-set") || [])];
  if (sets.length < 4) return;

  const emojiGroup = sets[0].querySelector(".marquee-emojis");
  const liveOption = sets[0].querySelector(".live");
  const messageSlots = [...sets[0].querySelectorAll(".marquee-message")];
  const messageOptions = [
    ...messageSlots.map((message) => ({ text: message.textContent, className: message.className })),
    { text: liveOption?.textContent || "En vivo", className: "live" },
    ...LOBBY_MARQUEE_EXTRA_MESSAGES.map((text) => ({
      text,
      className: text === "Estreno" ? "marquee-premiere" : "marquee-message",
    })),
  ];
  const emojis = (emojiGroup?.dataset.emojis || "").split(",").filter(Boolean);
  const variableTextCount = messageSlots.length + 1;
  if (messageSlots.length < 1 || !liveOption || emojis.length < 3) return;

  const shuffle = (items) => {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  };

  const phraseSetKey = (order) => order
    .map(({ className, text }) => `${className}:${text}`)
    .sort()
    .join("\u001f");
  const emojiKey = (order) => order.join("\u001f");
  const currentPhraseOrder = (set) => [...set.querySelectorAll(".live, .marquee-message, .marquee-premiere")]
    .map((phrase) => ({ text: phrase.textContent, className: phrase.className }));
  const currentEmojiOrder = (set) => [...set.querySelectorAll(".marquee-emoji")]
    .map((emoji) => emoji.textContent);
  const recentPhraseOrders = [];
  const rememberPhraseOrder = (order) => {
    recentPhraseOrders.push(order.map(({ text, className }) => ({ text, className })));
    if (recentPhraseOrders.length > 8) recentPhraseOrders.shift();
  };
  const phraseOverlapCount = (first, second) => {
    const secondTexts = new Set(second.map((option) => option.text));
    return first.filter((option) => secondTexts.has(option.text)).length;
  };

  const chooseDifferentOrder = (items, count, keyFor, forbiddenKeys) => {
    const forbidden = new Set(forbiddenKeys);
    let candidate = [];
    for (let attempt = 0; attempt < 32; attempt += 1) {
      candidate = shuffle(items).slice(0, count);
      if (!forbidden.has(keyFor(candidate))) return candidate;
    }

    const base = shuffle(items);
    for (let offset = 1; offset < base.length; offset += 1) {
      candidate = [...base.slice(offset), ...base.slice(0, offset)].slice(0, count);
      if (!forbidden.has(keyFor(candidate))) return candidate;
    }
    return candidate;
  };

  const chooseDifferentTextOrder = (forbiddenKeys, requireLive = false, excludeLive = false) => {
    const recentOrders = recentPhraseOrders.slice(-3);
    const forbidden = new Set([
      ...forbiddenKeys,
      ...recentOrders.map(phraseSetKey),
    ]);
    const recentComparisonOrders = recentOrders.slice(-2);
    const maxRecentOverlap = Math.floor(variableTextCount / 2);
    const candidateKeys = new Set();
    const candidates = [];

    for (let attempt = 0; attempt < 256; attempt += 1) {
      const order = shuffle(messageOptions).slice(0, variableTextCount);
      const key = phraseSetKey(order);
      if (candidateKeys.has(key)) continue;
      candidateKeys.add(key);
      if (forbidden.has(key)) continue;
      if (requireLive && !order.some((option) => option.className === "live")) continue;
      if (excludeLive && order.some((option) => option.className === "live")) continue;
      if (recentComparisonOrders.some((recent) => phraseOverlapCount(order, recent) > maxRecentOverlap)) continue;

      const score = recentOrders.reduce((total, recent, index) => (
        total + phraseOverlapCount(order, recent) * (index + 1)
      ), 0);
      candidates.push({ order, score });
    }

    if (candidates.length === 0) return shuffle(messageOptions).slice(0, variableTextCount);
    const bestScore = Math.min(...candidates.map(({ score }) => score));
    const bestOrders = candidates
      .filter(({ score }) => score === bestScore)
      .map(({ order }) => order);
    return shuffle(bestOrders[Math.floor(Math.random() * bestOrders.length)]);
  };

  const renderSet = (set, phraseOrder, emojiOrder) => {
    const phraseNodes = phraseOrder.map(({ text, className }) => {
      const item = document.createElement("span");
      item.className = className;
      item.textContent = text;
      return item;
    });
    const newEmojiGroup = document.createElement("span");
    newEmojiGroup.className = "marquee-emojis";
    newEmojiGroup.dataset.emojis = emojis.join(",");
    newEmojiGroup.setAttribute("aria-hidden", "true");
    newEmojiGroup.replaceChildren(...emojiOrder.map((emoji) => {
      const item = document.createElement("span");
      item.className = "marquee-emoji";
      item.textContent = emoji;
      return item;
    }));

    set.querySelector(".marquee-emojis")?.replaceWith(newEmojiGroup);
    [...set.querySelectorAll(".live, .marquee-message, .marquee-premiere")]
      .forEach((node) => node.remove());
    set.prepend(...phraseNodes);
    phraseNodes.at(-1)?.after(newEmojiGroup);
  };

  const initialPhraseOrders = [];
  const initialEmojiOrders = [];
  sets.forEach((set, setIndex) => {
    const liveCount = initialPhraseOrders.filter((order) => order.some((item) => item.className === "live")).length;
    const phraseOrder = chooseDifferentTextOrder(
      initialPhraseOrders.map(phraseSetKey),
      setIndex === sets.length - 1 && liveCount === 0,
      liveCount >= 2,
    );
    const emojiOrder = chooseDifferentOrder(
      emojis,
      3,
      emojiKey,
      initialEmojiOrders.map(emojiKey),
    );
    initialPhraseOrders.push(phraseOrder);
    rememberPhraseOrder(phraseOrder);
    initialEmojiOrders.push(emojiOrder);
    renderSet(set, phraseOrder, emojiOrder);
  });

  const getStepDistance = (firstSet) => {
    const marginInlineEnd = Number.parseFloat(getComputedStyle(firstSet).marginInlineEnd) || 0;
    return firstSet.getBoundingClientRect().width + marginInlineEnd;
  };

  let activeAnimation = null;
  let activeIncomingSet = null;
  const isLobbyMarqueeVisible = () => (
    !screen.hidden
    && document.body.classList.contains("is-lobby")
    && document.visibilityState !== "hidden"
  );

  function finishMarqueeStep(animation, incomingSet) {
    if (activeAnimation !== animation) return;

    const outgoingSet = track.querySelector(".marquee-set");
    if (!outgoingSet || outgoingSet !== incomingSet) return;

    const remainingSets = [...track.querySelectorAll(".marquee-set")].slice(1);
    const forbiddenPhraseOrders = remainingSets.map((set) => phraseSetKey(currentPhraseOrder(set)));
    const forbiddenEmojiOrders = remainingSets.map((set) => emojiKey(currentEmojiOrder(set)));
    forbiddenPhraseOrders.push(phraseSetKey(currentPhraseOrder(outgoingSet)));
    forbiddenEmojiOrders.push(emojiKey(currentEmojiOrder(outgoingSet)));

    // La tanda entrante ya está en el borde izquierdo al terminar este paso.
    // Rotar el DOM y reiniciar el transform en el mismo turno conserva esa
    // posición mientras la tanda saliente vuelve fuera del recorte.
    track.append(outgoingSet);
    animation.cancel();
    track.style.transform = "translateX(0px)";

    const liveCount = remainingSets.filter((set) => set.querySelector(".live")).length;
    const nextPhraseOrder = chooseDifferentTextOrder(
      forbiddenPhraseOrders,
      liveCount === 0,
      liveCount >= 2,
    );
    const nextEmojiOrder = chooseDifferentOrder(emojis, 3, emojiKey, forbiddenEmojiOrders);
    rememberPhraseOrder(nextPhraseOrder);
    renderSet(outgoingSet, nextPhraseOrder, nextEmojiOrder);

    activeAnimation = null;
    activeIncomingSet = null;
    animateNextSet();
  }

  const syncMarqueePlayback = () => {
    if (!activeAnimation) return;

    const endTime = activeAnimation.effect?.getComputedTiming().endTime;
    const isAtEnd = Number.isFinite(endTime) && activeAnimation.currentTime >= endTime;

    if (isLobbyMarqueeVisible()) {
      if (isAtEnd) {
        // play() reiniciaría un tramo pausado que ya terminó; procesarlo aquí
        // mantiene el orden visual y continúa desde la tanda siguiente.
        finishMarqueeStep(activeAnimation, activeIncomingSet);
      } else if (activeAnimation.playState === "paused") {
        activeAnimation.play();
      }
    } else if (activeAnimation.playState === "finished") {
      finishMarqueeStep(activeAnimation, activeIncomingSet);
    } else if (
      activeAnimation.playState === "running"
      || activeAnimation.playState === "pending"
    ) {
      activeAnimation.pause();
    }
  };

  const marqueeVisibilityObserver = new MutationObserver(syncMarqueePlayback);
  marqueeVisibilityObserver.observe(screen, {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  marqueeVisibilityObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  document.addEventListener("visibilitychange", syncMarqueePlayback);

  const animateNextSet = () => {
    const currentSets = [...track.querySelectorAll(".marquee-set")];
    const incomingSet = currentSets[0];
    if (!incomingSet || currentSets.length < 2) return;

    const stepDistance = getStepDistance(incomingSet);
    if (stepDistance <= 0) return;

    const animation = track.animate([
      { transform: "translateX(0px)" },
      { transform: `translateX(-${stepDistance.toFixed(2)}px)` },
    ], {
      duration: (stepDistance / LOBBY_MARQUEE_SPEED_PX_PER_SECOND) * 1000,
      easing: "linear",
      fill: "forwards",
    });
    activeAnimation = animation;
    activeIncomingSet = incomingSet;
    syncMarqueePlayback();
    animation.onfinish = () => finishMarqueeStep(animation, incomingSet);
  };

  track.style.transform = "translateX(0px)";
  animateNextSet();
}
