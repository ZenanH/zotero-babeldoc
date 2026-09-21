// @ts-check

import zotero from "@zotero-plugin/eslint-config";

export default zotero({
  ignores: [".scaffold/**", "node_modules/**"],
  overrides: [
    {
      files: ["**/*.ts"],
      rules: {
        "@typescript-eslint/no-unused-vars": "off",
      },
    },
  ],
});
