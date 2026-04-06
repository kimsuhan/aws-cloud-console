import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AppProfileSummary, AppUiScale, DependencyStatus, RuntimeConfigState } from '@shared/contracts'

const profiles: AppProfileSummary[] = [
  {
    id: 'profile-1',
    name: 'dev-admin',
    region: 'ap-northeast-2',
    createdAt: '2026-03-31T09:10:11.000Z',
    updatedAt: '2026-03-31T09:10:11.000Z',
    hasSessionToken: false,
    isDefault: true
  }
]

const dependencyStatus: DependencyStatus = {
  awsCli: {
    installed: true,
    resolvedPath: '/opt/homebrew/bin/aws',
    source: 'configured',
    error: null
  },
  sessionManagerPlugin: {
    installed: false,
    resolvedPath: null,
    source: 'missing',
    error: 'not found'
  }
}

const runtimeConfig: RuntimeConfigState = {
  awsCliPath: '/opt/homebrew/bin/aws',
  sessionManagerPluginPath: ''
}

const uiScale: AppUiScale = '110'

test('SettingsDrawer renders staged settings sections with application controls first', async () => {
  const { SettingsDrawer } = await import('./settings-drawer')
  const { I18nProvider } = await import('./i18n')

  const markup = renderToStaticMarkup(
    <I18nProvider language='en'>
      <SettingsDrawer
        dependencyStatus={dependencyStatus}
        editingProfileId={null}
        language='en'
        theme='system'
        uiScale={uiScale}
        profileForm={{
          name: '',
          region: 'ap-northeast-2',
          accessKeyId: '',
          secretAccessKey: '',
          sessionToken: ''
        }}
        profileFormError={null}
        profiles={profiles}
        resetAppDataConfirmVisible={false}
        resetAppDataConfirmationText=''
        runtimeConfig={runtimeConfig}
        runtimeFormError={null}
        onBeginCreateProfile={() => {}}
        onBeginEditProfile={() => {}}
        onChangeLanguage={() => {}}
        onChangeTheme={() => {}}
        onChangeUiScale={() => {}}
        onDeleteProfile={() => {}}
        onResetAppData={() => {}}
        onSaveProfile={() => {}}
        onSaveRuntimePaths={() => {}}
        onUpdateProfileForm={() => {}}
        onUpdateResetText={() => {}}
        onUpdateRuntimeField={() => {}}
      />
    </I18nProvider>
  )

  assert.match(markup, /Settings/)
  assert.match(markup, /Settings sections/)
  assert.match(markup, /class="settings-step-list"[^>]*data-active-section="basics"/)
  assert.match(markup, /class="settings-focus-panel"[^>]*data-active-section="basics"/)
  assert.match(markup, /Application/)
  assert.match(markup, /Profiles/)
  assert.match(markup, /Advanced/)
  assert.match(markup, /Theme mode/)
  assert.match(markup, /System/)
  assert.match(markup, /Light/)
  assert.match(markup, /Dark/)
  assert.match(markup, /<fieldset[^>]*>/)
  assert.match(markup, /<legend[^>]*>Theme mode<\/legend>/)
  assert.match(markup, /aria-checked="true"[^>]*tabindex="0"[^>]*>System/)
  assert.match(markup, /aria-checked="false"[^>]*tabindex="-1"[^>]*>Light/)
  assert.match(markup, /aria-checked="true"[^>]*>System/)
  assert.match(markup, /UI scale/)
  assert.match(markup, /90%/)
  assert.match(markup, /100%/)
  assert.match(markup, /110%/)
  assert.match(markup, /120%/)
  assert.doesNotMatch(markup, /close/i)
  assert.doesNotMatch(markup, /Profile name/)
  assert.doesNotMatch(markup, /Default region/)
  assert.doesNotMatch(markup, /Access key ID/)
  assert.doesNotMatch(markup, /Local tools/)
  assert.doesNotMatch(markup, /utility-drawer/)
})
