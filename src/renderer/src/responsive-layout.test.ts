import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('mobile layout prioritizes the workspace content before the rail and keeps navigation compact', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')

  assert.match(css, /@media \(max-width: 860px\)/)
  assert.match(css, /\.main-shell\s*\{[^}]*order:\s*1;/s)
  assert.match(css, /\.sidebar-shell\s*\{[^}]*order:\s*2;/s)
  assert.match(css, /\.workspace-nav\s*\{[^}]*display:\s*flex;/s)
  assert.match(css, /\.workspace-nav\s*\{[^}]*overflow-x:\s*auto;/s)
})

test('narrow desktop layout keeps the utility panel visible as an adaptive operations strip', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')

  assert.match(css, /@media \(max-width: 1100px\)/)
  assert.match(
    css,
    /@media \(max-width: 1100px\)\s*\{[\s\S]*?\.utility-panel\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s
  )
  assert.match(
    css,
    /@media \(max-width: 1100px\)\s*\{[\s\S]*?\.utility-panel-header\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/s
  )
  assert.doesNotMatch(
    css,
    /@media \(max-width: 1100px\)\s*\{[\s\S]*?\.utility-panel\s*\{[\s\S]*?display:\s*none;/s
  )
})

test('phone layout stacks the utility panel cards into a single column instead of dropping them', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')

  assert.match(css, /@media \(max-width: 640px\)/)
  assert.match(
    css,
    /@media \(max-width: 640px\)\s*\{[\s\S]*?\.utility-panel\s*\{[\s\S]*?grid-template-columns:\s*1fr;/s
  )
})

test('settings keeps the global operations summary mounted instead of hiding the utility panel', () => {
  const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')

  assert.match(
    appSource,
    /<UtilityPanel\s+profiles=\{readiness\.profiles\}\s+selectedProfileId=\{selectedProfileId\}[\s\S]*liveItems=\{liveItems\}\s+notices=\{notices\}[\s\S]*workspace=\{activeTab \? 'session' : activeTunnelTab \? 'tunnel-session' : currentWorkspace\}\s+\/>/s
  )
  assert.doesNotMatch(appSource, /currentWorkspace === 'settings' \? null/)
})

test('workspace changes use motion-safe transitions instead of abrupt content swaps', () => {
  const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')

  assert.match(appSource, /onSelectWorkspace=\{\(workspace\) => \{\s*runMotionSafeTransition\(\(\) => \{\s*setCurrentWorkspace\(workspace\)\s*setActiveTabId\(null\)/s)
})

test('workspace grids reserve flexible height for the content body instead of the header toolbars', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')

  assert.match(
    css,
    /\.quick-access-dashboard\s*\{[^}]*grid-template-rows:\s*auto\s+auto\s+auto\s+minmax\(0,\s*1fr\);/s
  )
  assert.match(
    css,
    /\.settings-workspace\s*\{[^}]*grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\);/s
  )
  assert.match(
    css,
    /\.quick-access-command-bar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s
  )
})

test('tunnel draft summary gives long selections their own row and clips overflow instead of colliding with the header', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')

  assert.match(css, /\.tunnel-draft-summary\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/s)
  assert.match(css, /\.tunnel-draft-summary-label\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s)
  assert.match(css, /\.tunnel-draft-chip\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s)
})
