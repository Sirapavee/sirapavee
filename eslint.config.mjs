import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import configPrettier from "eslint-config-prettier/flat";
import configSimpleImportSort from "eslint-plugin-simple-import-sort";
import configTsEslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  configPrettier,
  configTsEslint.configs.recommended,
  {
    plugins: {
      "simple-import-sort": configSimpleImportSort,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error"],
      "@typescript-eslint/no-explicit-any": [
        "error",
        {
          ignoreRestArgs: true,
        },
      ],
      "implicit-arrow-linebreak": "off",
      "import/extensions": "off",
      "import/no-extraneous-dependencies": "off",
      "import/no-unresolved": "off",
      "import/prefer-default-export": "off",
      "max-len": "off",
      "no-console": "warn",
      "no-plusplus": "off",
      "no-restricted-exports": "off",
      "no-template-curly-in-string": "off",
      "no-unused-expressions": "off",
      "no-unused-vars": "off",
      "prefer-const": "off",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/set-state-in-render": "warn",
      "simple-import-sort/exports": "error",
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            ["^react", "^@?\\w"], // react packages, other packages
            ["^(components|src)(/.*|$)", "^\\."], // internal components, relative imports
            ["^\\u0000"], // side effect imports
          ],
        },
      ],
      "tailwindcss/no-custom-classname": "off",
      "tailwindcss/enforces-shorthand": "off",
      "tailwindcss/no-unnecessary-arbitrary-value": "off",
    },
  },
]);

export default eslintConfig;
