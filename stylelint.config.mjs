import projectRules from "./scripts/stylelint-project-rules.mjs";

/** @type {import('stylelint').Config} */
export default {
  extends: ["stylelint-config-recommended"],
  plugins: projectRules,
  rules: {
    // El CSS usa capas y overrides, por eso se permiten selectores repetidos.
    "no-descending-specificity": null,
    "no-duplicate-selectors": null,
    // Las clases quedan libres para convenciones actuales o BEM.
    "selector-class-pattern": null,
    // BEM-compatible: avisa por longitud sin restringir los nombres de clase.
    "cine/selector-max-length": [160, { severity: "warning" }],
    "declaration-block-no-duplicate-properties": [true, { severity: "warning" }],
    "declaration-block-no-shorthand-property-overrides": [true, { severity: "warning" }],
    "property-no-deprecated": [true, { severity: "warning" }],
    "declaration-no-important": [true, { severity: "warning" }],
    "cine/no-magic-numbers": [true, { severity: "warning" }],
    "cine/css-variables-first": [true, { severity: "warning" }],
  },
};
