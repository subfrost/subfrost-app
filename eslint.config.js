export default [
  {
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parser: "@typescript-eslint/parser",
      },
    },
    plugins: ["@typescript-eslint"],
  },
];
