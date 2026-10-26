/** Parse React Native JSX and plain JS without executing or changing the source. */
const fs = require('node:fs');
const { parse } = require('@babel/parser');
const file = process.argv[2];
if (!file) throw new Error('JavaScript filename required');
try {
  parse(fs.readFileSync(file, 'utf8'), { sourceType: 'unambiguous', plugins: ['jsx'] });
} catch (error) {
  console.error(`${file}:${error.loc?.line || '?'}:${error.loc?.column || '?'} ${error.message}`);
  process.exit(1);
}
