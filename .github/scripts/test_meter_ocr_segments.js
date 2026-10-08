const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'photoModeData.js'), 'utf8').replace(/export /g, '');
const { extraireValeurOcr, extraireIndexSegments, resumeIncertitudesSegments } =
  new Function(src + '; return {extraireValeurOcr, extraireIndexSegments, resumeIncertitudesSegments};')();

const digit = (key, margin = 3, alternatives = key) => ({ key, margin, uncertain: margin < 1, alternatives });
const row = (text, extra = {}) => ({
  plausible: true, score: 20, mlKitDigits: text.length, dotAfter: -1, dotStrength: 0, box: { left: 1, top: 2, right: 3, bottom: 4 },
  digits: [...text].map(key => digit(key)), ...extra });
const meter = { kind: 'meter', unit: 'MWh' };

// A decoded row becomes a reviewable suggestion with its decimal point.
let found = extraireValeurOcr({ text: '', passes: [{ text: 'MWh' }], segments: [row('2350154', { dotAfter: 4, dotStrength: 1 })] }, meter);
assert.equal(found.value, '23501.54');
assert.equal(found.unit, 'MWh');
assert.equal(found.requiresReview, true, 'segment readings are always confirmed by the user');
assert.equal(found.source, 'seven-segment');
assert.equal(found.decimalUncertain, false);
assert.equal(found.unitFromField, false, 'the unit text was read on the photo');

// Leading zeros and a three-decimal display stay exactly as decoded.
found = extraireValeurOcr({ segments: [row('07928519', { dotAfter: 4, dotStrength: 1 })] }, { kind: 'meter', unit: 'm³' });
assert.equal(found.value, '07928.519');
assert.equal(found.unitFromField, true, 'no unit on the photo: the field unit is used and said so');

// Low-margin digits are reported, with the alternatives the reader considered.
found = extraireIndexSegments({ segments: [{ ...row('2350153', { dotAfter: 4, dotStrength: 1 }),
  digits: [...'2350153'].map((key, i) => i === 6 ? digit(key, 0.3, '34') : digit(key)) }] }, meter);
assert.deepEqual(found.uncertainDigits, [{ position: 7, chosen: '3', alternatives: ['4'] }]);
assert.equal(found.prefill, false, 'a doubtful digit means the field is NOT pre-filled');
assert.equal(found.value, '');
assert.equal(found.suggestion, '23501.53', 'the reading is still offered as a hint');
assert.match(resumeIncertitudesSegments(found), /n°7 \(3 ou 4\)/);

// A weak decimal point is flagged instead of presented as certain.
found = extraireIndexSegments({ segments: [row('2350154', { dotAfter: 4, dotStrength: 0.25 })] }, meter);
assert.equal(found.decimalUncertain, true);
assert.equal(found.value, '', 'a doubtful decimal point blocks the pre-fill');
assert.match(resumeIncertitudesSegments(found), /virgule/);
found = extraireIndexSegments({ segments: [row('2350154')] }, meter);
assert.equal(found.suggestion, '2350154');
assert.equal(found.value, '');
assert.equal(found.decimalUncertain, true, 'no point decoded: the value has no invented decimals');
// Digit count that differs from ML Kit's own line by one: hint only.
found = extraireIndexSegments({ segments: [row('2350154', { dotAfter: 4, dotStrength: 1, mlKitDigits: 6 })] }, meter);
assert.equal(found.prefill, false);
assert.equal(found.suggestion, '23501.54');

// A wrong unit on the photo still blocks application.
found = extraireIndexSegments({ passes: [{ text: '07928 m³' }], segments: [row('07928')] }, { kind: 'meter', unit: 'MWh' });
assert.equal(found.unitMismatch, true);

// Structure guards: implausible rows, wrong digit count, and non-digits propose nothing.
assert.equal(extraireValeurOcr({ segments: [row('2350154', { plausible: false })] }, meter), null);
assert.equal(extraireValeurOcr({ segments: [row('2350154', { mlKitDigits: 4 })] }, meter), null, 'ML Kit saw far fewer digits on that line');
assert.equal(extraireValeurOcr({ segments: [row('23')] }, meter), null, 'too short to be an index');
assert.equal(extraireValeurOcr({ segments: [{ ...row('2350154'), digits: [...'2350154'].map((key, i) => digit(i === 2 ? '?' : key)) }] }, meter), null);
assert.equal(extraireValeurOcr({ text: '2350154', segments: [] }, meter), null, 'a bare number without unit stays rejected');
assert.equal(extraireValeurOcr({ segments: [] }, meter), null);

// Text and segments agree on every digit: ML Kit loses the point, the segments supply it.
found = extraireValeurOcr({ passes: [{ text: '2350 154\nWh.' }, { text: '2350 154 MWh' }, { text: '2350 154 MWh' }],
  segments: [row('2350154', { dotAfter: 4, dotStrength: 1 })] }, meter);
assert.equal(found.value, '23501.54');
assert.equal(found.corroborated, true);

// ML Kit repeating the same wrong digits across passes (real case: 955,67 read "9555 wh") is not proof.
const wrong = { passes: [{ text: '9555 wh' }, { text: '9555 wh' }, { text: '9555 wh' }, { text: '9555 wh' }] };
found = extraireValeurOcr(wrong, meter);
assert.equal(found.value, '', 'an integer MWh read from text alone is never pre-filled');
assert.equal(found.prefill, false);
assert.equal(found.suggestion, '9555');
assert.match(resumeIncertitudesSegments(found), /sans virgule/);
// ...and when the segments disagree, nothing is filled and both readings are shown.
found = extraireValeurOcr({ ...wrong, segments: [row('95567', { dotAfter: 2, dotStrength: 1 })] }, meter);
assert.equal(found.value, '');
assert.equal(found.conflict, '9555');
assert.equal(found.suggestion, '955.67');
assert.match(resumeIncertitudesSegments(found), /divergent/);
// A strict text reading with a real decimal and no segment reading is unchanged.
found = extraireValeurOcr({ passes: [{ text: '23501.54 MWh' }, { text: '23501.54 MWh' }] }, meter);
assert.equal(found.value, '23501.54');

// Never invents a dot inside a display that has none decoded, and the best-scoring row wins.
found = extraireIndexSegments({ segments: [row('11111', { score: 5 }), row('86420', { score: 30, dotAfter: 2, dotStrength: 1 })] }, meter);
assert.equal(found.value, '864.20');
assert.equal(found.prefill, true);

// Source contracts: native pieces are shipped and the bridge reports them without risking the text readings.
const kotlin = fs.readFileSync(path.join(root, 'native/metra-mission-tools/MetraOcrModule.kt'), 'utf8');
const plugin = fs.readFileSync(path.join(root, 'plugins/withMetraMissionTools.js'), 'utf8');
assert.ok(kotlin.includes('MeterSegmentReader.read('), 'bridge must call the seven-segment reader');
assert.ok(/try \{[\s\S]*MeterSegmentReader\.read[\s\S]*catch \(skipped: Throwable\)/.test(kotlin), 'a reader failure must not discard text readings');
assert.ok(kotlin.indexOf('payload.putArray("passes", passes)') < kotlin.indexOf('MeterSegmentReader.read('), 'text passes are filled first');
for (const file of ['SevenSegmentReader.java', 'SevenSegmentModel.java', 'SevenSegmentWeights.java', 'MeterSegmentReader.java']) assert.ok(plugin.includes(`'${file}'`), `plugin must copy ${file}`);
for (const file of ['SevenSegmentReader.java', 'MeterSegmentReader.java']) assert.ok(fs.existsSync(path.join(root, 'native/metra-mission-tools', file)));
const reader = fs.readFileSync(path.join(root, 'native/metra-mission-tools/SevenSegmentReader.java'), 'utf8');
assert.ok(!/android\./.test(reader), 'the reader stays pure Java so the JVM regression can run it');
console.log('Seven-segment second opinion: formatting, uncertainty, unit, structure guards and native packaging verified.');
