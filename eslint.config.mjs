// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/*.mjs",
      "UI_TUNER_EXECUTION_PLAN.md",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
