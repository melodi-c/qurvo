const { base, typeAware } = require('@qurvo/eslint-config');

module.exports = [
  ...base,
  ...typeAware('./tsconfig.json'),
];
