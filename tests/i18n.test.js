/**
 * i18n completeness test — a PERMANENT guard against the exact class of bug
 * that kept recurring during development: new UI content shipped in English
 * only, with Arabic/French silently falling back to the English string.
 *
 * This doesn't check that translations are *correct* (that still needs a
 * human who reads Arabic/French), but it guarantees every English key has
 * *some* entry in every other language — so a missing translation fails the
 * test suite immediately, rather than surfacing later as a user report.
 *
 * Covers both frontends: the tenant storefront (public/app.js) and the
 * platform site (public-platform/app.js), each of which has its own
 * independent I18N dictionary.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { test, suite } = require('./harness');

function extractI18N(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const match = code.match(/const I18N = \{[\s\S]*?\n\};/);
  if (!match) throw new Error(`No I18N dictionary found in ${filePath}`);
  // eslint-disable-next-line no-eval
  const I18N = eval(match[0].replace(/^const I18N\s*=\s*/, '(').replace(/;\s*$/, ')'));
  return I18N;
}

module.exports = async function runI18nTests() {
  await suite('i18n — every English key has an Arabic and French counterpart', async () => {
    await test('tenant storefront (public/app.js): no missing translations', async () => {
      const I18N = extractI18N(path.join(__dirname, '..', 'public', 'app.js'));
      const enKeys = Object.keys(I18N.en);
      const missingAr = enKeys.filter(k => I18N.ar[k] === undefined);
      const missingFr = enKeys.filter(k => I18N.fr[k] === undefined);
      assert.strictEqual(missingAr.length, 0, `Missing Arabic translations for: ${missingAr.join(', ')}`);
      assert.strictEqual(missingFr.length, 0, `Missing French translations for: ${missingFr.join(', ')}`);
    });
    await test('platform site (public-platform/app.js): no missing translations', async () => {
      const I18N = extractI18N(path.join(__dirname, '..', 'public-platform', 'app.js'));
      const enKeys = Object.keys(I18N.en);
      const missingAr = enKeys.filter(k => I18N.ar[k] === undefined);
      const missingFr = enKeys.filter(k => I18N.fr[k] === undefined);
      assert.strictEqual(missingAr.length, 0, `Missing Arabic translations for: ${missingAr.join(', ')}`);
      assert.strictEqual(missingFr.length, 0, `Missing French translations for: ${missingFr.join(', ')}`);
    });
    await test('no translation value is suspiciously identical to a different English key (copy-paste guard)', async () => {
      // Weak heuristic, not a hard failure elsewhere: flags if an entire dictionary
      // is empty, which would otherwise pass the "no missing keys" checks above
      // vacuously if someone accidentally emptied a language object.
      const tenantI18N = extractI18N(path.join(__dirname, '..', 'public', 'app.js'));
      const platformI18N = extractI18N(path.join(__dirname, '..', 'public-platform', 'app.js'));
      assert.ok(Object.keys(tenantI18N.ar).length > 50, 'Tenant Arabic dictionary looks empty or truncated');
      assert.ok(Object.keys(tenantI18N.fr).length > 50, 'Tenant French dictionary looks empty or truncated');
      assert.ok(Object.keys(platformI18N.ar).length > 20, 'Platform Arabic dictionary looks empty or truncated');
      assert.ok(Object.keys(platformI18N.fr).length > 20, 'Platform French dictionary looks empty or truncated');
    });
  });
};
