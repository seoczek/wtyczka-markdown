import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "dist/", "coverage/", "test-results/", "playwright-report/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "popup.js", "offscreen.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, ...globals.webextensions }
    }
  },
  {
    files: ["background.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.serviceworker, ...globals.webextensions }
    }
  },
  {
    files: ["tests/**/*.js", "scripts/**/*.js", "*.config.js"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node }
    }
  },
  {
    files: ["tests/e2e/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions, convert: "readonly" }
    }
  },
  {
    rules: {
      "no-unused-vars": ["error", { caughtErrors: "none" }],
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
      "no-var": "error"
    }
  }
];
