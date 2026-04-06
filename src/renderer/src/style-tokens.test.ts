import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('status surfaces use semantic tone tokens instead of one-off color literals', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')

  assert.match(css, /--tone-success-foreground:/)
  assert.match(css, /--tone-success-border:/)
  assert.match(css, /--tone-success-background:/)
  assert.match(css, /--tone-error-foreground:/)
  assert.match(css, /--tone-error-border:/)
  assert.match(css, /--tone-error-background:/)
  assert.match(css, /--tone-info-foreground:/)
  assert.match(css, /--tone-info-border:/)
  assert.match(css, /--tone-info-background:/)
  assert.match(css, /\.utility-notice-success\s*\{[^}]*border-color:\s*var\(--tone-success-border\);[^}]*background:\s*var\(--tone-success-background\);[^}]*color:\s*var\(--tone-success-foreground\);/s)
  assert.match(css, /\.utility-notice-error\s*\{[^}]*border-color:\s*var\(--tone-error-border\);[^}]*background:\s*var\(--tone-error-background\);[^}]*color:\s*var\(--tone-error-foreground\);/s)
  assert.match(css, /\.utility-notice-info\s*\{[^}]*border-color:\s*var\(--tone-info-border\);[^}]*background:\s*var\(--tone-info-background\);[^}]*color:\s*var\(--tone-info-foreground\);/s)
  assert.match(css, /\.callout-error\s*\{[^}]*color:\s*var\(--tone-error-foreground\);[^}]*border-color:\s*var\(--tone-error-border\);[^}]*background:\s*var\(--tone-error-background\);/s)
  assert.match(css, /\.callout-success\s*\{[^}]*color:\s*var\(--tone-success-foreground\);[^}]*border-color:\s*var\(--tone-success-border\);[^}]*background:\s*var\(--tone-success-background\);/s)
})

test('interaction surfaces define motion tokens and preserve a reduced-motion path', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')

  assert.match(css, /--motion-fast:/)
  assert.match(css, /--motion-base:/)
  assert.match(css, /--ease-out-quart:/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.workspace-filter-pill[\s\S]*?transition:\s*none;/s)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.launcher-row[\s\S]*?animation:\s*none;/s)
})
