import js from "@eslint/js";
import globals from "globals";

const recommended = js.configs.recommended;

export default [
  {
    ignores: [
      "index.html",
      "node_modules/**",
      "output/**",
      "public/vendor/**",
      ".playwright-cli/**",
      ".playwright-mcp/**",
      ".tmp/**",
    ],
  },
  {
    files: ["src/**/*.js", "public/**/*.js", "console/**/*.js"],
    ...recommended,
    languageOptions: {
      ...recommended.languageOptions,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        firebase: "readonly",
      },
    },
  },
  {
    files: ["scripts/**/*.js"],
    ...recommended,
    languageOptions: {
      ...recommended.languageOptions,
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
  {
    files: ["scripts/verify-mobile-page.js"],
    languageOptions: {
      globals: globals.browser,
    },
  },
];
