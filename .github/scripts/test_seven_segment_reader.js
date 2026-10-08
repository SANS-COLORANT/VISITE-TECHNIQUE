// Compiles the pure-Java SevenSegmentReader and runs its JVM regression (synthetic LCD rows,
// decimal points, ghost segments, slant, noise, blank crop). No Android SDK needed.
// Real photos stay local: node ... --real path/to/cases.tsv (see docs/QA_OCR_SEVEN_SEGMENT.md).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const dir = path.join(root, 'native/metra-mission-tools');
const javac = spawnSync('javac', ['-version'], { encoding: 'utf8' });
if (javac.error) {
  console.log('SKIPPED seven-segment JVM regression: no JDK (javac) available. This is not a validation.');
  process.exit(0);
}
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'seven-segment-'));
try {
  const build = spawnSync('javac', ['-nowarn', '-d', out, path.join(dir, 'SevenSegmentReader.java'),
    path.join(dir, 'tests/SevenSegmentReaderCheck.java')], { encoding: 'utf8' });
  if (build.status !== 0) { console.error(build.stdout + build.stderr); process.exit(1); }
  const real = process.argv.indexOf('--real');
  const args = ['-cp', out, 'com.metra.missiontools.SevenSegmentReaderCheck', ...(real > 0 ? ['real', process.argv[real + 1]] : ['synthetic'])];
  const run = spawnSync('java', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.stdout.write(run.stdout.split('\n').filter(l => !l.startsWith('DIGIT')).join('\n'));
  process.stderr.write(run.stderr.split('\n').filter(l => !l.startsWith('Picked up')).join('\n'));
  process.exit(run.status ?? 1);
} finally { fs.rmSync(out, { recursive: true, force: true }); }
