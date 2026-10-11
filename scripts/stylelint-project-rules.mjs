import stylelint from "stylelint";
import selectorParser from "postcss-selector-parser";
import valueParser from "postcss-value-parser";
import noHardcodedColors from "./stylelint-no-hardcoded-colors.mjs";

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const magicNumberRuleName = "cine/no-magic-numbers";
const magicNumberMessages = ruleMessages(magicNumberRuleName, {
  rejected: (values) =>
    `Extrae los valores numéricos directos (${values}) a variables CSS o tokens de diseño.`,
});

const variableOrderRuleName = "cine/css-variables-first";
const variableOrderMessages = ruleMessages(variableOrderRuleName, {
  rejected: (property) =>
    `Ubica "${property}" en la sección inicial de variables CSS de este archivo.`,
});

const selectorLengthRuleName = "cine/selector-max-length";
const selectorLengthMessages = ruleMessages(selectorLengthRuleName, {
  rejected: (length, maximum) =>
    `El selector tiene ${length} caracteres; acortalo a ${maximum} o menos.`,
});

const selectorNestingDepthRuleName = "cine/selector-max-nesting-depth";
const selectorNestingDepthMessages = ruleMessages(selectorNestingDepthRuleName, {
  rejected: (depth, maximum) =>
    `La regla tiene ${depth} niveles de anidación CSS; mantenela en ${maximum} o menos.`,
});

const colorFunctions = new Set([
  "color",
  "color-mix",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "rgb",
  "rgba",
]);

const cssLengthUnits = new Set([
  "%",
  "cap",
  "ch",
  "cm",
  "cqb",
  "cqh",
  "cqi",
  "cqmax",
  "cqmin",
  "cqw",
  "dvb",
  "dvh",
  "dvi",
  "dvmax",
  "dvmin",
  "dvw",
  "em",
  "ex",
  "fr",
  "ic",
  "in",
  "lh",
  "lvb",
  "lvh",
  "lvi",
  "lvw",
  "mm",
  "ms",
  "pc",
  "pt",
  "px",
  "q",
  "rad",
  "rem",
  "rlh",
  "s",
  "svb",
  "svh",
  "svi",
  "svw",
  "turn",
  "vb",
  "vh",
  "vi",
  "vmax",
  "vmin",
  "vw",
]);

const unitlessMagicProperties = new Set([
  "animation-iteration-count",
  "aspect-ratio",
  "column-count",
  "filter",
  "flex",
  "flex-grow",
  "flex-shrink",
  "font-weight",
  "line-height",
  "opacity",
  "order",
  "scale",
  "stroke-width",
  "transform",
  "z-index",
]);

const numberWithOptionalUnit = /^([+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?)([a-zA-Z]+|%)?$/i;

function isMagicNumber(token, property) {
  const match = token.match(numberWithOptionalUnit);
  if (!match) return false;

  const numericValue = Number(match[1]);
  const unit = match[2];
  if (numericValue === 0) return false;
  if (unit) return cssLengthUnits.has(unit.toLowerCase());
  return unitlessMagicProperties.has(property);
}

const selectorMaxLength = createPlugin(selectorLengthRuleName, (maximum) => {
  return (root, result) => {
    if (
      !validateOptions(result, selectorLengthRuleName, {
        actual: maximum,
        possible: [(value) => Number.isInteger(value) && value > 0],
      })
    ) {
      return;
    }

    root.walkRules((rule) => {
      try {
        selectorParser((selectors) => {
          selectors.each((selector) => {
            const value = selector.toString().trim();
            if (value.length <= maximum) return;

            report({
              result,
              ruleName: selectorLengthRuleName,
              message: selectorLengthMessages.rejected(value.length, maximum),
              node: rule,
              word: value,
              severity: "warning",
            });
          });
        }).processSync(rule.selector);
      } catch {
        // Let Stylelint's CSS parser report malformed selectors.
      }
    });
  };
});

const selectorMaxNestingDepth = createPlugin(selectorNestingDepthRuleName, (maximum) => {
  return (root, result) => {
    if (
      !validateOptions(result, selectorNestingDepthRuleName, {
        actual: maximum,
        possible: [(value) => Number.isInteger(value) && value > 0],
      })
    ) {
      return;
    }

    root.walkRules((rule) => {
      let depth = 0;
      for (let parent = rule.parent; parent; parent = parent.parent) {
        if (parent.type === "rule") depth += 1;
      }
      if (depth <= maximum) return;

      report({
        result,
        ruleName: selectorNestingDepthRuleName,
        message: selectorNestingDepthMessages.rejected(depth, maximum),
        node: rule,
        word: rule.selector,
        severity: "warning",
      });
    });
  };
});

const noMagicNumbers = createPlugin(magicNumberRuleName, (primary) => {
  return (root, result) => {
    if (!validateOptions(result, magicNumberRuleName, { actual: primary, possible: [true] })) {
      return;
    }

    root.walkDecls((declaration) => {
      if (declaration.prop.startsWith("--")) return;

      const property = declaration.prop.toLowerCase();
      const parsedValue = valueParser(declaration.value);
      const numericValues = new Set();
      const visitNodes = (nodes, insideColorFunction = false) => {
        for (const node of nodes) {
          const insideColor =
            insideColorFunction ||
            (node.type === "function" && colorFunctions.has(node.value.toLowerCase()));

          if (!insideColor && node.type === "word" && isMagicNumber(node.value, property)) {
            numericValues.add(node.value);
          }

          if (node.nodes) visitNodes(node.nodes, insideColor);
        }
      };
      visitNodes(parsedValue.nodes);
      if (numericValues.size === 0) return;

      const values = [...numericValues];
      report({
        result,
        ruleName: magicNumberRuleName,
        message: magicNumberMessages.rejected(values.join(", ")),
        node: declaration,
        word: values[0],
        severity: "warning",
      });
    });
  };
});

function reportLateVariable(result, declaration) {
  report({
    result,
    ruleName: variableOrderRuleName,
    message: variableOrderMessages.rejected(declaration.prop),
    node: declaration,
    word: declaration.prop,
    severity: "warning",
  });
}

const cssVariablesFirst = createPlugin(variableOrderRuleName, (primary) => {
  return (root, result) => {
    if (!validateOptions(result, variableOrderRuleName, { actual: primary, possible: [true] })) {
      return;
    }

    let leadingVariableSection = true;

    for (const node of root.nodes ?? []) {
      if (node.type === "comment") continue;

      if (node.type === "atrule" && ["charset", "import", "namespace"].includes(node.name)) {
        continue;
      }

      if (node.type === "atrule") {
        node.walkDecls(/^--/, (declaration) => reportLateVariable(result, declaration));
        leadingVariableSection = false;
        continue;
      }

      if (node.type !== "rule") continue;

      let ordinaryDeclarationSeen = false;
      for (const child of node.nodes ?? []) {
        if (child.type !== "decl") continue;

        if (child.prop.startsWith("--")) {
          if (!leadingVariableSection || ordinaryDeclarationSeen) {
            reportLateVariable(result, child);
          }
        } else {
          ordinaryDeclarationSeen = true;
        }
      }

      const hasCustomProperties = (node.nodes ?? []).some(
        (child) => child.type === "decl" && child.prop.startsWith("--"),
      );
      if (!hasCustomProperties) leadingVariableSection = false;
    }
  };
});

export default [
  selectorMaxLength,
  selectorMaxNestingDepth,
  noMagicNumbers,
  cssVariablesFirst,
  noHardcodedColors,
];
