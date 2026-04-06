import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('detectAppLanguage maps Korean locales to ko and falls back to en', async () => {
  const { detectAppLanguage } = await import('./i18n')

  assert.equal(detectAppLanguage('ko-KR'), 'ko')
  assert.equal(detectAppLanguage('ko'), 'ko')
  assert.equal(detectAppLanguage('fr-FR'), 'en')
})

test('I18nProvider renders translated strings for both languages', async () => {
  const { I18nProvider, useI18n } = await import('./i18n')

  function Sample(): React.JSX.Element {
    const { t } = useI18n()
    return <span>{t('nav.settings')}</span>
  }

  const korean = renderToStaticMarkup(
    <I18nProvider language='ko'>
      <Sample />
    </I18nProvider>
  )
  const english = renderToStaticMarkup(
    <I18nProvider language='en'>
      <Sample />
    </I18nProvider>
  )

  assert.match(korean, /설정/)
  assert.match(english, /Settings/)
})
