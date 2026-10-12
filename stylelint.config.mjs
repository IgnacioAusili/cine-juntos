import projectRules from "./scripts/stylelint-project-rules.mjs";

/** @type {import('stylelint').Config} */
export default {
  extends: ["stylelint-config-recommended"],
  plugins: projectRules,
  rules: {
    // El CSS usa capas y overrides, por eso se permiten selectores repetidos.
    "no-descending-specificity": null,
    "no-duplicate-selectors": null,
    // Las clases heredadas se conservan durante la migracion progresiva a BEM.
    "selector-class-pattern": null,
    // BEM-compatible: avisa por longitud sin restringir los nombres de clase.
    "cine/selector-max-length": [160, { severity: "warning" }],
    // Limita los encadenamientos y la anidación CSS para facilitar el mantenimiento.
    "selector-max-compound-selectors": [4, { severity: "warning" }],
    "cine/selector-max-nesting-depth": [3, { severity: "warning" }],
    "declaration-block-no-duplicate-properties": [true, { severity: "warning" }],
    "declaration-block-no-shorthand-property-overrides": [true, { severity: "warning" }],
    "property-no-deprecated": [true, { severity: "warning" }],
    "declaration-no-important": [true, { severity: "warning" }],
    "cine/no-magic-numbers": [true, { severity: "warning" }],
    "cine/css-variables-first": [true, { severity: "warning" }],
    "cine/no-hardcoded-colors": [true, { severity: "warning" }],
  },
  overrides: [
    {
      files: [
        "public/styles/components/button-layout.css",
        "public/styles/components/button-skin.css",
      ],
      rules: {
        "selector-class-pattern": [
          "^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?|is-[a-z0-9]+(?:-[a-z0-9]+)*|primary|active)$",
          { resolveNestedSelectors: true },
        ],
      },
    },
    {
      files: [
        "public/styles/mini-player-adjustments.css",
        "public/styles/mini-player-touch-layout.css",
        "public/styles/mobile-touch-portrait-overrides.css",
        "public/styles/player-control-line-layout.css",
        "public/styles/player-controls-density.css",
        "public/styles/player-controls-layout.css",
        "public/styles/player-empty-state.css",
        "public/styles/player-overlay-states.css",
        "public/styles/player-seek-slider.css",
        "public/styles/player-volume-layout.css",
      ],
      rules: {
        // El bloque de control de video valida modificadores BEM sin renombrar clases heredadas.
        "selector-class-pattern": [
          "^(?:video-control-button(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?|(?!(?:video-control-button-))[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?|is-[a-z0-9]+(?:-[a-z0-9]+)*|primary|active)$",
          { resolveNestedSelectors: true },
        ],
      },
    },
  ],
};
