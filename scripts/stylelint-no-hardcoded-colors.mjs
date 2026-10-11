import stylelint from "stylelint";
import { findLiteralColors, isColorProperty } from "./css-color-utils.mjs";

const ruleName = "cine/no-hardcoded-colors";
const { createPlugin, utils: { report, ruleMessages, validateOptions } } = stylelint;
const messages = ruleMessages(ruleName, {
  rejected: (colors) =>
    `Usa variables CSS para los colores directos (${colors}) de esta declaración.`,
});

export default createPlugin(ruleName, (primary) => {
  return (root, result) => {
    if (!validateOptions(result, ruleName, { actual: primary, possible: [true] })) return;

    root.walkDecls((declaration) => {
      if (declaration.prop.startsWith("--")) return;
      if (!isColorProperty(declaration.prop.toLowerCase())) return;

      const colors = [...new Set(findLiteralColors(declaration.value))];
      if (colors.length === 0) return;

      report({
        result,
        ruleName,
        message: messages.rejected(colors.join(", ")),
        node: declaration,
        word: colors[0],
        severity: "warning",
      });
    });
  };
});
