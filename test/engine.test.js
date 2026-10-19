// Engine tests for The Tavern Lore Keeper — pure functions, no DOM.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
// Anchor on the engine block, not merely the first <script> in the page:
// the PWA/dark-mode bootstrap is also a script block and may come first.
const start = html.indexOf('ENGINE — pure functions, no DOM');
if (start === -1) { console.error('NO ENGINE BLOCK FOUND'); process.exit(1); }
// Rewind to the start of the comment line so the extracted block stays
// syntactically valid JavaScript.
const commentStart = html.lastIndexOf('/*', start);
if (commentStart === -1) { console.error('NO COMMENT OPEN FOUND'); process.exit(1); }
const tail = html.slice(commentStart);
const end = tail.indexOf('</script>');
if (end === -1) { console.error('NO SCRIPT CLOSE FOUND'); process.exit(1); }
const m = [null, tail.slice(0, end)];

fs.writeFileSync(path.join(__dirname, 'engine.js'),
  m[1] + '\nmodule.exports = { TAVERN_PREFIXES, TAVERN_NOUNS, TAVERN_FLAVOR, RUMOR_TARGETS, RUMOR_CLAIMS, RUMOR_WHISPERS, PATRON_LOOKS, PATRON_SECRETS, ITEM_NAMES, ITEM_CURSES, pick, genTavern, genRumor, genPatron, genItem, GENERATORS, generate, eveningOffering };'
);

const E = require('./engine.js');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
}

function seededRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

console.log('— content tables —');
ok(E.TAVERN_PREFIXES.length >= 15, 'tavern prefixes plentiful (' + E.TAVERN_PREFIXES.length + ')');
ok(E.TAVERN_NOUNS.length >= 10, 'tavern nouns plentiful');
ok(E.TAVERN_FLAVOR.length >= 8, 'flavor lines plentiful');
ok(E.RUMOR_TARGETS.length >= 8 && E.RUMOR_CLAIMS.length >= 8 && E.RUMOR_WHISPERS.length >= 4, 'rumor tables complete');
ok(E.PATRON_LOOKS.length >= 8 && E.PATRON_SECRETS.length >= 8, 'patron tables complete');
ok(E.ITEM_NAMES.length >= 8 && E.ITEM_CURSES.length >= 8, 'item tables complete');

console.log('— genTavern —');
const t1 = E.genTavern(seededRng(1));
ok(t1.kind === 'a tavern', 'has a kind');
ok(E.TAVERN_PREFIXES.some(p => t1.title.startsWith(p + ' ')), 'title starts with a prefix');
ok(E.TAVERN_NOUNS.some(n => t1.title.endsWith(n)), 'title ends with a noun');
ok(t1.body.includes('where ') && t1.body.length > 10, 'flavorful body');

console.log('— genRumor —');
const r1 = E.genRumor(seededRng(2));
ok(r1.kind === 'a rumor', 'has a kind');
ok(r1.title === 'They say…', 'standard opener');
ok(r1.body.startsWith('They say '), 'rumor phrasing');
ok(E.RUMOR_TARGETS.some(x => r1.body.includes(x)), 'references a target');

console.log('— genPatron —');
const p1 = E.genPatron(seededRng(3));
ok(p1.kind === 'a mysterious patron', 'has a kind');
ok(E.PATRON_LOOKS.some(l => p1.title === l), 'title is a look');
ok(p1.body.startsWith('Secret: '), 'reveals a secret');

console.log('— genItem —');
const i1 = E.genItem(seededRng(4));
ok(i1.kind === 'a cursed item', 'has a kind');
ok(E.ITEM_NAMES.some(n => i1.title === n), 'title is an item name');
ok(i1.body.startsWith('It '), 'cursed phrasing');

console.log('— generate dispatch —');
ok(E.generate('tavern', seededRng(5)).kind === 'a tavern', 'dispatches tavern');
ok(E.generate('rumor', seededRng(5)).kind === 'a rumor', 'dispatches rumor');
ok(E.generate('patron', seededRng(5)).kind === 'a mysterious patron', 'dispatches patron');
ok(E.generate('item', seededRng(5)).kind === 'a cursed item', 'dispatches item');
ok(E.generate('bogus', seededRng(5)) === null, 'unknown kind → null');

console.log('— determinism —');
const a = E.genTavern(seededRng(77));
const b = E.genTavern(seededRng(77));
ok(a.title === b.title && a.body === b.body, 'same seed → same tavern');
const c = E.generate('rumor', seededRng(88));
const d = E.generate('rumor', seededRng(88));
ok(c.title === d.title && c.body === d.body, 'same seed → same rumor');

console.log('— eveningOffering —');
const off = E.eveningOffering(seededRng(9));
ok(off.tavern && off.rumor && off.patron && off.item, 'offering has all four');
ok(off.tavern.kind === 'a tavern' && off.item.kind === 'a cursed item', 'kinds correct');
const off2 = E.eveningOffering(seededRng(9));
ok(off.tavern.title === off2.tavern.title, 'offering is deterministic with seed');

console.log('— engine is DOM-free —');
ok(!m[1].includes('module.exports'), 'no pre-existing exports in source');

console.log('');
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
