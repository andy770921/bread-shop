module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
  },
  extends: ['react-app', 'prettier'],
  plugins: ['prettier'],
  rules: {
    'prettier/prettier': ['error'],
  },
  ignorePatterns: ['dist', '.eslintrc.cjs', 'node_modules'],
};
