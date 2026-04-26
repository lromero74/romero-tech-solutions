/**
 * Custom Jest transformer that wraps ts-jest, but first rewrites
 * `import.meta.env.X` -> `(process.env.X)` so Jest (CommonJS) can parse the source.
 *
 * Vite supports `import.meta.env` natively; Jest's CJS pipeline does not.
 * This shim is test-only — production builds still use Vite's transform.
 */
const { TsJestTransformer } = require('ts-jest');

const baseTransformer = new TsJestTransformer({
  tsconfig: '<rootDir>/tsconfig.test.json',
  isolatedModules: true,
  diagnostics: {
    ignoreCodes: [
      1343, 151001, 2339, 2322, 2345, 7006, 18046, 2532, 2367, 6133, 6196,
    ],
  },
});

function rewrite(src) {
  if (typeof src !== 'string') return src;
  if (!src.includes('import.meta')) return src;
  // Replace `import.meta.env.SOMETHING` with `(process.env.SOMETHING)`
  let out = src.replace(
    /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
    '(process.env.$1)'
  );
  // Replace any remaining bare `import.meta.env` with `(process.env)`
  out = out.replace(/import\.meta\.env/g, '(process.env)');
  // Replace any remaining `import.meta` with empty meta object
  out = out.replace(/import\.meta(?![A-Za-z0-9_])/g, '({})');
  return out;
}

module.exports = {
  canInstrument: baseTransformer.canInstrument,
  getCacheKey(sourceText, sourcePath, options) {
    const rewritten = rewrite(sourceText);
    return baseTransformer.getCacheKey
      ? baseTransformer.getCacheKey(rewritten, sourcePath, options)
      : sourcePath;
  },
  process(sourceText, sourcePath, options) {
    const rewritten = rewrite(sourceText);
    return baseTransformer.process(rewritten, sourcePath, options);
  },
  processAsync(sourceText, sourcePath, options) {
    const rewritten = rewrite(sourceText);
    if (baseTransformer.processAsync) {
      return baseTransformer.processAsync(rewritten, sourcePath, options);
    }
    return baseTransformer.process(rewritten, sourcePath, options);
  },
};
