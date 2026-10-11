const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { selectCompanionLicense } = require('../scripts/companion-license.cjs');
const snapshot = Buffer.from(['Permission grant', 'Warranty disclaimer', 'Use of the names "NARBE" does not grant trademark rights.', 'Contact', ''].join(String.fromCharCode(10)));
const changed = text => Buffer.from(snapshot.toString().replace(...text));
test('website branding updates retain the exact Companion license bytes', () => {
  const website = changed(['"NARBE"', '"NARBE" and "SwitchedGames"']);
  assert.equal(selectCompanionLicense(website, snapshot), snapshot);
  assert.equal(selectCompanionLicense(snapshot, snapshot), snapshot);
});
test('changes to permissions, disclaimers or other license text require review', () => {
  for (const edit of [['Permission grant', 'Changed grant'], ['Warranty disclaimer', 'New disclaimer'], ['Contact', 'Additional restrictions']]) {
    assert.throws(() => selectCompanionLicense(changed(edit), snapshot), /Software license terms changed/);
  }
});
test('missing or duplicate branding sections are rejected', () => {
  assert.throws(() => selectCompanionLicense(changed(['Use of the names ', 'Names: ']), snapshot));
  assert.throws(() => selectCompanionLicense(Buffer.concat([snapshot, snapshot]), snapshot));
});
test('checked-in snapshot preserves the reviewed 1.0.8 release license', () => {
  const root = path.resolve(__dirname, '..');
  const frozen = fs.readFileSync(path.join(root, 'extension/LICENSE'));
  assert.equal(selectCompanionLicense(fs.readFileSync(path.join(root, 'LICENSE')), frozen), frozen);
  assert.equal(require('node:crypto').createHash('sha256').update(frozen).digest('hex'),
    'af32bd99f40a2cffd022e4cc5e21fd33ac322d1ffb03826f79fe410674503ea8');
});
