const fs = require('fs');

const src = fs.readFileSync('PersistentControleGenerique.js', 'utf8');

function requireText(value, label) {
  if (!src.includes(value)) throw new Error(`${label}: missing ${value}`);
}

requireText("val === 'N.S' ? String(commentaire || '') : ''", 'N.S keeps an existing comment when selected');
requireText("avis === 'N.S' && critereChoisi === null", 'N.S free comment restores without a selected cause');
requireText("critereChoisi === null || modeLibre || options.length === 0", 'N.S free comment remains visible without a selected cause');
requireText("setCommentaire(etatInitial?.commentaire || '')", 'N.S persisted comment restores after remount');

if (src.includes("setAvis(val);\n    setCommentaire('');\n    setCritereChoisi(null);")) {
  throw new Error('Old unconditional comment clearing is still present when changing avis.');
}

console.log('N.S comment persistence regression guard: OK');
