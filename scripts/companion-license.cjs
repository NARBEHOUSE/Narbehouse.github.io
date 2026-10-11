// Keep the Companion's released license bytes stable when website branding changes.
// Any change outside the one separate branding paragraph requires an explicit
// review of the Companion license snapshot and a new immutable release candidate.
const assert = require('node:assert/strict');
function withoutBranding(license) {
  const marker = Buffer.from('Use of the names ');
  const start = license.indexOf(marker);
  const end = license.indexOf(10, start);
  assert.ok(start > 0 && license[start - 1] === 10 && end > start,
    'Expected one separate branding paragraph in the license');
  assert.equal(license.indexOf(marker, start + marker.length), -1,
    'Expected one separate branding paragraph in the license');
  return Buffer.concat([license.subarray(0, start), license.subarray(end)]);
}
function selectCompanionLicense(websiteLicense, companionLicense) {
  assert.ok(withoutBranding(websiteLicense).equals(withoutBranding(companionLicense)),
    'Software license terms changed; review the Companion license snapshot and prepare a new release candidate');
  return companionLicense;
}
module.exports = { selectCompanionLicense };
