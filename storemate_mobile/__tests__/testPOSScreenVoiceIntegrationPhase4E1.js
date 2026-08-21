/**
 * COUNTR Phase 4E-1
 * POSScreen must route voice through Phase 4D integration.
 *
 * This is intentionally a source-contract regression test. It does not
 * mount the complete RN screen, because POSScreen contains native modules.
 */

const fs = require('fs');
const path = require('path');

const POS_PATH = path.resolve(
  __dirname,
  '../src/screens/POSScreen.js'
);

describe('COUNTR Phase 4E-1 - POSScreen Voice Integration', () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(POS_PATH, 'utf8');
  });

  test('imports the Phase 4D POS voice integration', () => {
    expect(source).toMatch(
      /POSVoiceIntegrationPhase4D/
    );
  });

  test('does not use direct backend parse-intent fetch from POS voice path', () => {
    expect(source).not.toMatch(
      /fetch\s*\(\s*`\$\{BASE_URL\}\/api\/v1\/ai\/parse-intent/
    );
  });

  test('does not dynamically execute the legacy IntentHandler from POS voice path', () => {
    expect(source).not.toMatch(
      /import\s*\(\s*['"]\.\.\/core\/ai\/IntentHandler['"]\s*\)/
    );
  });

  test('does not directly call executeCommand from the voice screen handler', () => {
    expect(source).not.toMatch(
      /const\s+execution\s*=\s*await\s+executeCommand\s*\(/
    );
  });

  test('still uses SpeechEngine for Android speech input', () => {
    expect(source).toMatch(/SpeechEngine/);
    expect(source).toMatch(/onFinalResult/);
  });

  test('calls processPOSVoiceCommand from the speech final-result callback', () => {
    expect(source).toMatch(
      /onFinalResult[\s\S]{0,1200}processPOSVoiceCommand/
    );
  });
});
