import { readdir, readFile, writeFile } from "node:fs/promises";
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
const fixMode = process.argv.includes("--fix");

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

  const hasElementBeforeModifier =
    elementIndex > 0 && modifierIndex > elementIndex;
  const modifier =
    modifierIndex > 0
      ? className.slice(modifierIndex + 2)
      : null;

  return {
    block: className.slice(0, delimiterIndex),
    modifier,
    phase: hasElementBeforeModifier ? 2 : elementIndex === delimiterIndex ? 1 : 2,
  };
}

function responsiveRule(rule) {
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.type === "atrule" && ["container", "media", "supports"].includes(parent.name)) return true;
  }
  return false;
}

function phasesForSelector(selector, knownBlocks, isResponsive) {
  const phases = new Map();
  const selectorClasses = [];
  selector.walkClasses((classNode) => selectorClasses.push(classNode));
  let targetStart = 0;
  for (let index = 0; index < selector.nodes.length; index += 1) {
    if (selector.nodes[index].type === "combinator") targetStart = index + 1;
  }
  const targetNodes = selector.nodes.slice(targetStart);
  const targetClasses = [];
  for (const node of targetNodes) {
    if (node.type === "class") targetClasses.push(node);
    node.walkClasses?.((classNode) => targetClasses.push(classNode));
  }

  const selectorStateClasses = selectorClasses.map((classNode) => classNode.value.toLowerCase());
  const hasGenericStateClass = selectorStateClasses.some(
    (className) => genericStateClasses.has(className) || className.startsWith("is-"),
  );
  let hasInteractivePseudo = false;
  selector.walkPseudos((pseudo) => {
    if (interactivePseudos.has(pseudo.value.replace(/^:+/, "").toLowerCase())) {
      hasInteractivePseudo = true;
    }
  });
  const stateAttributeNames = new Set([
    "aria-busy",
    "aria-checked",
    "aria-current",
    "aria-disabled",
    "aria-expanded",
    "aria-invalid",
    "aria-pressed",
    "aria-selected",
  ]);
  const selectorStateAttributes = [];
  const visitSelectorAttribute = (attribute) => {
    const name = attribute.attribute.toLowerCase();
    if (
      stateAttributeNames.has(name) ||
      /^data-(active|busy|checked|disabled|expanded|invalid|loading|open|pressed|selected|state|status|visible)(-|$)/.test(name)
    ) selectorStateAttributes.push(name);
  };
  selector.walkAttributes(visitSelectorAttribute);

  for (const classNode of targetClasses) {
    const className = classNode.value;
    const parts = bemParts(className);
    const block = parts?.block ?? className;
    if (
      !knownBlocks.has(block) ||
      genericStateClasses.has(className.toLowerCase()) ||
      className.toLowerCase().startsWith("is-")
    ) {
      continue;
    }

    let phase = parts?.phase ?? 0;
    const relatedParts = selectorClasses
      .map((node) => bemParts(node.value))
      .filter((selectorParts) => selectorParts?.block === block);
    const relatedModifiers = relatedParts
      .map((selectorParts) => selectorParts.modifier?.toLowerCase())
      .filter(Boolean);
    if (relatedModifiers.length > 0) phase = Math.max(phase, 2);
    if (relatedModifiers.some((modifier) => stateModifiers.has(modifier))) phase = 3;
    if (
      hasInteractivePseudo ||
      (hasGenericStateClass && selectorClasses.some((node) => bemParts(node.value)?.block === block)) ||
      (selectorStateAttributes.length > 0 && selectorClasses.some((node) => bemParts(node.value)?.block === block))
    ) phase = Math.max(phase, 3);
    if (isResponsive) phase = 4;
    phases.set(block, Math.max(phases.get(block) ?? 0, phase));
  }
  return phases;
}

function collectKnownBlocks(root) {
  const knownBlocks = new Set();
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
  return knownBlocks;
}

function mergePhases(target, source) {
  for (const [block, phase] of source) {
    target.set(block, Math.max(target.get(block) ?? 0, phase));
  }
}

function phasesForRule(rule, knownBlocks, forceResponsive = false) {
  const phases = new Map();
  const isResponsive = forceResponsive || responsiveRule(rule);
  try {
    selectorParser((selectors) => {
      selectors.each((selector) => mergePhases(phases, phasesForSelector(selector, knownBlocks, isResponsive)));
    }).processSync(rule.selector);
  } catch {
    // Stylelint se ocupa de reportar selectores mal formados.
  }
  return phases;
}

function phasesForNode(node, knownBlocks) {
  const phases = new Map();
  if (node.type === "rule") {
    mergePhases(phases, phasesForRule(node, knownBlocks));
  } else if (node.type === "atrule" && ["media", "container", "supports"].includes(node.name)) {
    node.walkRules((rule) => mergePhases(phases, phasesForRule(rule, knownBlocks, true)));
  }
  return phases;
}

function isConditionalAtRule(node) {
  return node.type === "atrule" && ["container", "media", "supports"].includes(node.name);
}

function isVariableOnlyConditional(node) {
  if (!isConditionalAtRule(node)) return false;
  let count = 0;
  let hasOrdinaryDeclaration = false;
  node.walkDecls((declaration) => {
    count += 1;
    if (!declaration.prop.startsWith("--")) hasOrdinaryDeclaration = true;
  });
  return count > 0 && !hasOrdinaryDeclaration;
}

function pruneEmptyStyleNodes(node, isRootNode = false) {
  for (const child of [...(node.nodes ?? [])]) {
    if (child.type === "rule" || child.type === "atrule") {
      pruneEmptyStyleNodes(child);
    }
  }

  if (isRootNode || !["rule", "atrule"].includes(node.type)) return;
  let hasDeclaration = false;
  node.walkDecls(() => {
    hasDeclaration = true;
  });
  const hasNestedStyleNode = (node.nodes ?? []).some(
    (child) => child.type === "rule" || child.type === "atrule",
  );
  if (!hasDeclaration && !hasNestedStyleNode) node.remove();
}

function extractConditionalVariables(node) {
  if (!isConditionalAtRule(node)) return null;
  let variableCount = 0;
  const variableSection = node.clone();
  variableSection.walkDecls((declaration) => {
    if (declaration.prop.startsWith("--")) variableCount += 1;
    else declaration.remove();
  });
  if (variableCount === 0) return null;

  pruneEmptyStyleNodes(variableSection, true);
  node.walkDecls((declaration) => {
    if (declaration.prop.startsWith("--")) declaration.remove();
  });
  pruneEmptyStyleNodes(node, true);

  let hasOrdinaryDeclaration = false;
  node.walkDecls(() => {
    hasOrdinaryDeclaration = true;
  });
  if (!hasOrdinaryDeclaration) node.remove();
  return { node: variableSection, hasOriginal: hasOrdinaryDeclaration };
}

function orderChunks(chunks) {
  const edges = chunks.map(() => new Set());
  const indegree = chunks.map(() => 0);
  const addEdge = (from, to) => {
    if (from === to || edges[from].has(to)) return;
    edges[from].add(to);
    indegree[to] += 1;
  };

  for (let left = 0; left < chunks.length; left += 1) {
    for (let right = left + 1; right < chunks.length; right += 1) {
      const first = chunks[left];
      const second = chunks[right];
      const firstPrelude = Boolean(first.prelude);
      const secondPrelude = Boolean(second.prelude);
      if (firstPrelude !== secondPrelude) {
        addEdge(firstPrelude ? left : right, firstPrelude ? right : left);
      } else if (firstPrelude) {
        addEdge(left, right);
      }
      if (!firstPrelude && !secondPrelude && (first.pinned || second.pinned)) addEdge(left, right);
      if (first.keyframes !== second.keyframes) {
        addEdge(first.keyframes ? right : left, first.keyframes ? left : right);
      }
      if (!firstPrelude && !secondPrelude && first.variables !== second.variables) {
        addEdge(first.variables ? left : right, first.variables ? right : left);
      }

      for (const [block, firstPhase] of first.phases) {
        const secondPhase = second.phases.get(block);
        if (secondPhase === undefined || firstPhase === secondPhase) continue;
        addEdge(firstPhase < secondPhase ? left : right, firstPhase < secondPhase ? right : left);
      }
      for (const [block, firstPhase] of first.phases) {
        const secondPhase = second.phases.get(block);
        if (secondPhase !== undefined && firstPhase === secondPhase) addEdge(left, right);
      }
    }
  }

  const ready = chunks.filter((_, index) => indegree[index] === 0).map((chunk) => chunk.index);
  ready.sort((a, b) => a - b);
  const ordered = [];
  while (ready.length > 0) {
    const index = ready.shift();
    ordered.push(chunks[index]);
    for (const next of edges[index]) {
      indegree[next] -= 1;
      if (indegree[next] === 0) {
        ready.push(chunks[next].index);
        ready.sort((a, b) => a - b);
      }
    }
  }
  return ordered.length === chunks.length ? ordered : null;
}

async function fixFile(file, root, knownBlocks) {
  const chunks = [];
  let leadingComments = [];
  let structuralChange = false;
  for (const node of [...root.nodes]) {
    if (node.type === "comment") {
      leadingComments.push(node);
      continue;
    }

    if (isConditionalAtRule(node)) {
      if (isVariableOnlyConditional(node)) {
        const phases = phasesForNode(node, knownBlocks);
        for (const block of phases.keys()) phases.set(block, -1);
        chunks.push({
          index: chunks.length,
          nodes: [...leadingComments, node],
          phases,
          variables: true,
          keyframes: false,
          prelude: false,
          pinned: false,
        });
        leadingComments = [];
        continue;
      }

      const extracted = extractConditionalVariables(node);
      if (extracted) {
        structuralChange = true;
        const variablePhases = phasesForNode(extracted.node, knownBlocks);
        for (const block of variablePhases.keys()) variablePhases.set(block, -1);
        chunks.push({
          index: chunks.length,
          nodes: extracted.hasOriginal
            ? [extracted.node]
            : [...leadingComments, extracted.node],
          phases: variablePhases,
          variables: true,
          keyframes: false,
          pinned: false,
        });
        if (!extracted.hasOriginal) {
          leadingComments = [];
          continue;
        }
      }
    }

    if (node.type === "rule") {
      const variables = (node.nodes ?? []).filter(
        (child) => child.type === "decl" && child.prop.startsWith("--"),
      );
      const ordinaryDeclarations = (node.nodes ?? []).some(
        (child) => child.type === "decl" && !child.prop.startsWith("--"),
      );

      if (variables.length > 0 && ordinaryDeclarations) {
        structuralChange = true;
        const variableRule = node.clone({ nodes: variables.map((declaration) => declaration.clone()) });
        for (const declaration of variables) node.removeChild(declaration);
        const variablePhases = phasesForNode(variableRule, knownBlocks);
        for (const block of variablePhases.keys()) variablePhases.set(block, -1);
        chunks.push({
          index: chunks.length,
          nodes: [variableRule],
          phases: variablePhases,
          variables: true,
          keyframes: false,
          pinned: false,
        });
      } else if (variables.length > 0) {
        const phases = phasesForNode(node, knownBlocks);
        for (const block of phases.keys()) phases.set(block, -1);
        chunks.push({
          index: chunks.length,
          nodes: [...leadingComments, node],
          phases,
          variables: true,
          keyframes: false,
          pinned: false,
        });
        leadingComments = [];
        continue;
      }
    }

    const phases = phasesForNode(node, knownBlocks);
    chunks.push({
      index: chunks.length,
      nodes: [...leadingComments, node],
      phases,
      variables: false,
      prelude:
        node.type === "atrule" && ["charset", "import", "namespace"].includes(node.name),
      keyframes: node.type === "atrule" && /keyframes$/i.test(node.name),
      pinned:
        node.type === "atrule" &&
        !["charset", "import", "namespace"].includes(node.name) &&
        !["media", "container", "supports"].includes(node.name) &&
        !/keyframes$/i.test(node.name),
    });
    leadingComments = [];
  }

  if (leadingComments.length > 0) {
    if (chunks.length === 0) return false;
    chunks.at(-1).nodes.push(...leadingComments);
  }
  if (chunks.length < 2) return false;

  const ordered = orderChunks(chunks);
  if (!ordered) return false;

  const orderChanged = ordered.some((chunk, index) => chunk !== chunks[index]);
  const nodes = ordered.flatMap((chunk) => chunk.nodes);
  const initialWhitespace = root.nodes[0]?.raws?.before ?? "";
  let spacingChanged = false;
  for (let index = 0; index < ordered.length; index += 1) {
    for (let innerIndex = 0; innerIndex < ordered[index].nodes.length; innerIndex += 1) {
      const node = ordered[index].nodes[innerIndex];
      const fallbackBefore =
        innerIndex > 0 ? "\n" : index === 0 ? initialWhitespace : "\n\n";
      const before = /\r|\n/.test(node.raws.before ?? "") ? node.raws.before : fallbackBefore;
      if (node.raws.before !== before) spacingChanged = true;
      node.raws.before = before;
    }
  }
  if (!structuralChange && !orderChanged && !spacingChanged) return false;

  root.removeAll();
  root.append(...nodes);
  await writeFile(file, root.toString());
  return true;
}

const files = (await findCssFiles(cssRoot)).sort();
const parsedFiles = await Promise.all(
  files.map(async (file) => ({
    file,
    root: postcss.parse(await readFile(file, "utf8"), { from: file }),
  })),
);
for (const { file, root } of parsedFiles) {
  const knownBlocks = collectKnownBlocks(root);
  if (fixMode && (await fixFile(file, root, knownBlocks))) {
    console.log(`[css-component-order] Reordenado ${path.relative(process.cwd(), file)}.`);
  }
  const lastPhaseByBlock = new Map();
  root.walkRules((rule) => {
    const variableOnly =
      rule.parent?.type === "root" &&
      (rule.nodes ?? []).every(
        (node) => node.type === "comment" || (node.type === "decl" && node.prop.startsWith("--")),
      );
    let conditionalVariableSection = false;
    for (let parent = rule.parent; parent && parent.type !== "root"; parent = parent.parent) {
      if (parent.parent?.type === "root" && isVariableOnlyConditional(parent)) {
        conditionalVariableSection = true;
        break;
      }
    }
    if (variableOnly || conditionalVariableSection) return;

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
