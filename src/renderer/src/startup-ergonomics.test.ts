import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('small controls use a touch-friendly minimum height token', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')

  assert.match(css, /--control-height-sm:\s*calc\(44px \* var\(--ui-scale\)\);/)
  assert.doesNotMatch(css, /--control-height-sm:\s*calc\(34px \* var\(--ui-scale\)\);/)
})

test('keychain notice CTA uses direct action copy without bracket decoration', () => {
  const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
  const i18nSource = readFileSync(new URL('./i18n.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(appSource, /\[\s*\{t\(appLanguage,\s*'common\.continue'\)\}\s*]/)
  assert.match(appSource, /t\(appLanguage,\s*'shell\.secureStorageContinue'\)/)
  assert.match(i18nSource, /'shell\.secureStorageContinue':\s*'Continue to workspace'/)
})
