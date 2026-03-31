import test from 'node:test'
import assert from 'node:assert/strict'

import { createRendererResponseHeaders } from './renderer-protocol'
import { buildProductionContentSecurityPolicy } from './security'

test('createRendererResponseHeaders applies CSP to packaged html responses', () => {
  const headers = createRendererResponseHeaders('/tmp/renderer/index.html')

  assert.equal(headers.get('content-type'), 'text/html; charset=utf-8')
  assert.equal(headers.get('content-security-policy'), buildProductionContentSecurityPolicy())
})

test('createRendererResponseHeaders does not apply CSP to non-html assets', () => {
  const headers = createRendererResponseHeaders('/tmp/renderer/assets/index.js')

  assert.equal(headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.equal(headers.get('content-security-policy'), null)
})
