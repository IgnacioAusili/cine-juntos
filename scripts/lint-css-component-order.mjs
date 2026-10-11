import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const cssRoot = path.resolve("public/styles");
const interactivePseudos = new Set([
  "active",
  "checked",
  "disabled",
  "enabled",
  "focus",
  "focus-visible",
  "focus-within",
  "hover",
  "invalid",
  "open",
  "pressed",
  "target",
  "visited",
]);
const genericStateClasses = new Set([
  "active",
  "disabled",
  "is-active",
  "is-disabled",
  "is-open",
  "is-selected",
  "is-visible",
]);
const stateModifiers = new Set([
  "active",
  "busy",
  "checked",
  "disabled",
  "enabled",
  "expanded",
  "focus",
  "focus-visible",
  "hover",
  "invalid",
  "loading",
  "open",
  "pressed",
  "selected",
  "visible",
]);
const phaseNames = ["base", "elementos", "variantes", "estados", "responsive"];

async function findCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findCssFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".css") ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

function bemParts(className) {
  const elementIndex = className.indexOf("__");
  const modifierIndex = className.indexOf("--");
  const indexes = [elementIndex, modifierIndex].filter((index) => index > 0);
  const delimiterIndex = indexes.length > 0 ? Math.min(...indexes) : -1;
  if (delimiterIndex < 0) return null;

  return {
    block: className.slice(0, delimiterIndex),
    modifier: modifierIndex === delimiterIndex ? className.slice(delimiterIndex + 2) : null,
    phase: elementIndex === delimiterIndex ? 1 : 2,
  };
}

function responsiveRule(rule) {
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.type === "atrule" && ["container", "media"].includes(parent.name)) return true;
  }
  return false;
}

function phasesForSelector(selector, knownBlocks, isResponsive) {
  const phases = new Map();
  let hasInteractionState = false;
  selector.walkPseudos((pseudo) => {
    if (interactivePseudos.has(pseudo.value.replace(/^:+/, "").toLowerCase())) {
      hasInteractionState = true;
    }
  });
  selector.walkClasses((classNode) => {
    const className = classNode.value.toLowerCase();
    if (genericStateClasses.has(className) || className.startsWith("is-")) {
      hasInteractionState = true;
    }
  });
  selector.walkAttributes((attribute) => {
    const name = attribute.attribute.toLowerCase();
    if (
      [
        "aria-busy",
        "aria-checked",
        "aria-current",
        "aria-disabled",
        "aria-expanded",
        "aria-invalid",
        "aria-pressed",
        "aria-selected",
      ].includes(name) ||
      name.startsWith("data-")
    ) {
      hasInteractionState = true;
    }
  });

  selector.walkClasses((classNode) => {
    const className = classNode.value;
    const parts = bemParts(className);
    const block = parts?.block ?? className;
    if (
      !knownBlocks.has(block) ||
      genericStateClasses.has(className.toLowerCase()) ||
      className.toLowerCase().startsWith("is-")
    ) {
      return;
    }

    let phase = parts?.phase ?? 0;
    if (parts?.modifier && stateModifiers.has(parts.modifier.toLowerCase())) phase = 3;
    if (hasInteractionState) phase = Math.max(phase, 3);
    if (isResponsive) phase = 4;
    phases.set(block, Math.max(phases.get(block) ?? 0, phase));
  });
  return phases;
}

function collectKnownBlocks(parsedFiles) {
  const knownBlocks = new Set();
  for (const { root } of parsedFiles) {
    root.walkRules((rule) => {
      try {
        selectorParser((selectors) => {
          selectors.walkClasses((classNode) => {
            const parts = bemParts(classNode.value);
            if (parts) knownBlocks.add(parts.block);
          });
        }).processSync(rule.selector);
      } catch {
        // Stylelint se ocupa de reportar selectores mal formados.
      }
    });
  }
  return knownBlocks;
}

const files = (await findCssFiles(cssRoot)).sort();
const parsedFiles = await Promise.all(
  files.map(async (file) => ({
    file,
    root: postcss.parse(await readFile(file, "utf8"), { from: file }),
  })),
);
const knownBlocks = collectKnownBlocks(parsedFiles);

for (const { file, root } of parsedFiles) {
  const lastPhaseByBlock = new Map();
  root.walkRules((rule) => {
    const selectorPhases = new Map();
    const isResponsive = responsiveRule(rule);
    try {
      selectorParser((selectors) => {
        selectors.each((selector) => {
          for (const [block, phase] of phasesForSelector(selector, knownBlocks, isResponsive)) {
            selectorPhases.set(block, Math.max(selectorPhases.get(block) ?? 0, phase));
          }
        });
      }).processSync(rule.selector);
    } catch {
      return;
    }

    for (const [block, phase] of selectorPhases) {
      const previous = lastPhaseByBlock.get(block);
      if (previous && phase < previous.phase) {
        console.warn(
          `[css-component-order] ${path.relative(process.cwd(), file)}:${rule.source?.start?.line ?? 1} ` +
            `"${rule.selector}" está en ${phaseNames[phase]} después de ${phaseNames[previous.phase]} ` +
            `para el bloque .${block} (antes en línea ${previous.line}). Orden sugerido: ` +
            `${phaseNames.join(" → ")}.`,
        );
      }
      lastPhaseByBlock.set(block, { phase, line: rule.source?.start?.line ?? 1 });
    }
  });
}
