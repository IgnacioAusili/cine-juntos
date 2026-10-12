import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import {
  findLiteralColors,
  findVariableReferences,
  isColorProperty,
  normalizeColor,
} from "./css-color-utils.mjs";

const cssRoot = path.resolve("public");
const sharedValueProperties = new Set([
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-start-start-radius",
  "border-start-end-radius",
  "border-end-start-radius",
  "border-end-end-radius",
  "box-shadow",
  "column-gap",
  "font-family",
  "font-size",
  "font-weight",
  "gap",
  "letter-spacing",
  "line-height",
  "margin",
  "margin-block",
  "margin-block-end",
  "margin-block-start",
  "margin-bottom",
  "margin-inline",
  "margin-inline-end",
  "margin-inline-start",
  "margin-left",
  "margin-right",
  "margin-top",
  "opacity",
  "padding",
  "padding-block",
  "padding-block-end",
  "padding-block-start",
  "padding-bottom",
  "padding-inline",
  "padding-inline-end",
  "padding-inline-start",
  "padding-left",
  "padding-right",
  "padding-top",
  "row-gap",
  "text-shadow",
]);
const occurrencesByDeclaration = new Map();
const occurrencesByColor = new Map();
const variableValues = new Map();

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

function ruleFor(declaration, file) {
  for (let node = declaration.parent; node; node = node.parent) {
    if (node.type !== "rule") continue;

    const selector = node.selector.replace(/\s+/g, " ").trim();
    const start = node.source?.start;
    const sourceFile = node.source?.input?.file ?? file;
    return {
      selector,
      ruleKey: `${sourceFile}:${start?.line ?? 1}:${start?.column ?? 1}`,
    };
  }
  return { selector: "(sin selector)", ruleKey: `${file}:root` };
}

function normalizeValue(value) {
  return value.trim().replace(/\s+/g, " ");
}

function collectColors(value, visiting = new Set()) {
  const colors = new Set(findLiteralColors(value));
  for (const variable of findVariableReferences(value)) {
    if (visiting.has(variable)) continue;

    const nextVisiting = new Set(visiting).add(variable);
    const candidates = new Set();
    for (const variableValue of variableValues.get(variable) ?? []) {
      for (const color of collectColors(variableValue, nextVisiting)) candidates.add(color);
    }

    // Solo resolvemos una variable si todas sus definiciones apuntan al mismo color.
    if (candidates.size === 1) colors.add([...candidates][0]);
  }
  return colors;
}

function addOccurrence(map, key, occurrence) {
  const occurrences = map.get(key) ?? [];
  occurrences.push(occurrence);
  map.set(key, occurrences);
}

const files = (await findCssFiles(cssRoot)).sort();
const parsedFiles = await Promise.all(
  files.map(async (file) => ({
    file,
    root: postcss.parse(await readFile(file, "utf8"), { from: file }),
  })),
);

for (const { root } of parsedFiles) {
  root.walkDecls(/^--/, (declaration) => {
    const values = variableValues.get(declaration.prop) ?? [];
    values.push(declaration.value);
    variableValues.set(declaration.prop, values);
  });
}

for (const { file, root } of parsedFiles) {
  root.walkDecls((declaration) => {
    if (declaration.prop.startsWith("--")) return;

    const property = declaration.prop.toLowerCase();
    const value = normalizeValue(declaration.value);
    const rule = ruleFor(declaration, file);
    const location = {
      file: path.relative(process.cwd(), file),
      line: declaration.source?.start?.line ?? 1,
      property: declaration.prop,
      ...rule,
      value,
    };

    if (sharedValueProperties.has(property) && value) {
      addOccurrence(occurrencesByDeclaration, `${property}:${value.toLowerCase()}`, location);
    }

    if (!isColorProperty(property)) return;
    for (const color of collectColors(declaration.value)) {
      addOccurrence(occurrencesByColor, normalizeColor(color), location);
    }
  });
}

function printRepeatedWarnings(groups, label, detail) {
  for (const [value, occurrences] of groups) {
    if (occurrences.length < 2) continue;

    const byRule = new Map();
    for (const occurrence of occurrences) {
      const ruleOccurrences = byRule.get(occurrence.ruleKey) ?? [];
      ruleOccurrences.push(occurrence);
      byRule.set(occurrence.ruleKey, ruleOccurrences);
    }

    const bySelector = new Map();
    for (const occurrence of occurrences) {
      const selectorOccurrences = bySelector.get(occurrence.selector) ?? [];
      selectorOccurrences.push(occurrence);
      bySelector.set(occurrence.selector, selectorOccurrences);
    }

    if (bySelector.size > 1) {
      const examples = [...bySelector]
        .slice(0, 4)
        .map(([selector, matches]) => `${selector} (${matches[0].file}:${matches[0].line})`)
        .join("; ");
      const remainder = bySelector.size > 4 ? `; y ${bySelector.size - 4} selectores más` : "";
      console.warn(
        `[${label}-across-selectors] ${detail(value)} aparece ${occurrences.length} veces ` +
          `en ${bySelector.size} selectores: ${examples}${remainder}. Revisa si conviene compartirlo.`,
      );
    } else if (byRule.size > 1) {
      const locations = [...byRule.values()]
        .map((matches) => `${matches[0].file}:${matches[0].line}`)
        .slice(0, 4)
        .join(", ");
      const remainder = byRule.size > 4 ? ` y ${byRule.size - 4} reglas más` : "";
      console.warn(
        `[${label}-across-rules] ${detail(value)} aparece en ${byRule.size} reglas separadas ` +
          `del selector ${occurrences[0].selector}: ${locations}${remainder}. Revisa si conviene consolidarlas.`,
      );
    }

    for (const matches of byRule.values()) {
      if (matches.length < 2) continue;
      const locations = matches
        .slice(0, 4)
        .map(({ file, line }) => `${file}:${line}`)
        .join(", ");
      const remainder = matches.length > 4 ? ` y ${matches.length - 4} más` : "";
      console.warn(
        `[${label}-within-selector] ${detail(value)} se repite ${matches.length} veces en ` +
          `${matches[0].selector}: ${locations}${remainder}. Revisa si es una duplicación intencional.`,
      );
    }
  }
}

printRepeatedWarnings(
  occurrencesByDeclaration,
  "css-shared-value",
  (key) => key.replace(":", ": "),
);
printRepeatedWarnings(
  occurrencesByColor,
  "css-shared-color",
  (color) => `el color ${color}`,
);
