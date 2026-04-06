import { useEffect, useId, useState } from 'react'

import type { AppLanguage, AppProfileSummary, AppTheme, AppUiScale, DependencySource, DependencyStatus, RuntimeConfigState } from '@shared/contracts'

import { RegionPicker } from './components/RegionPicker'
import { WorkspaceHeader } from './components/WorkspaceHeader'
import { useI18n } from './i18n'
import { runMotionSafeTransition } from './motion'
import { useRadioGroupNavigation } from './radio-group'

interface ProfileFormState {
  name: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
}

interface SettingsDrawerProps {
  language: AppLanguage
  theme: AppTheme
  uiScale: AppUiScale
  profiles: AppProfileSummary[]
  editingProfileId: string | null
  profileForm: ProfileFormState
  profileFormError: string | null
  runtimeConfig: RuntimeConfigState
  runtimeFormError: string | null
  dependencyStatus: DependencyStatus
  resetAppDataConfirmVisible: boolean
  resetAppDataConfirmationText: string
  onChangeLanguage: (language: AppLanguage) => void
  onChangeTheme: (theme: AppTheme) => void
  onChangeUiScale: (uiScale: AppUiScale) => void
  onBeginEditProfile: (profile: AppProfileSummary) => void
  onDeleteProfile: (profileId: string) => void
  onBeginCreateProfile: () => void
  onUpdateProfileForm: (patch: Partial<ProfileFormState>) => void
  onSaveProfile: () => void
  onUpdateRuntimeField: (field: keyof RuntimeConfigState, value: string) => void
  onSaveRuntimePaths: () => void
  onUpdateResetText: (value: string) => void
  onResetAppData: () => void
}

type SettingsSectionKey = 'basics' | 'profiles' | 'advanced'

function dependencySourceLabel(t: (key: string, params?: Record<string, string | number>) => string, source: DependencySource): string {
  switch (source) {
    case 'configured':
      return t('settings.dependencySource.configured')
    case 'well-known':
      return t('settings.dependencySource.wellKnown')
    case 'path':
      return t('settings.dependencySource.path')
    default:
      return source
  }
}

function dependencyCaption(
  t: (key: string, params?: Record<string, string | number>) => string,
  labelKey: 'settings.dependency.awsCli' | 'settings.dependency.sessionManagerPlugin',
  status: DependencyStatus['awsCli'] | DependencyStatus['sessionManagerPlugin']
): string {
  const label = t(labelKey)

  if (!status.installed) {
    return t('settings.dependencyStatus.missing', { label })
  }

  return t('settings.dependencyStatus.detected', {
    label,
    source: dependencySourceLabel(t, status.source),
    path: status.resolvedPath ?? '-'
  })
}

function SettingsField({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="form-field">
      <span className="form-field-label">{label}</span>
      {hint ? <span className="form-field-hint">{hint}</span> : null}
      {children}
    </label>
  )
}

function SettingsChoiceGroup<TOption extends string>({
  label,
  hint,
  value,
  options,
  onChange
}: {
  label: string
  hint?: string
  value: TOption
  options: Array<{ value: TOption; label: string }>
  onChange: (value: TOption) => void
}): React.JSX.Element {
  const hintId = useId()
  const { getRadioProps } = useRadioGroupNavigation({
    onChange,
    options: options.map((option) => option.value),
    value
  })

  return (
    <fieldset className="form-field choice-fieldset">
      <legend className="form-field-label">{label}</legend>
      {hint ? <span className="form-field-hint" id={hintId}>{hint}</span> : null}
      <div
        aria-describedby={hint ? hintId : undefined}
        aria-label={label}
        aria-orientation="horizontal"
        className="choice-row"
        role="radiogroup"
      >
        {options.map((option, index) => (
          <button
            key={option.value}
            aria-checked={value === option.value}
            className={value === option.value ? 'choice-button active' : 'choice-button'}
            {...getRadioProps(option.value, index)}
            onClick={() => onChange(option.value)}
            role="radio"
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function SettingsStepButton({
  active,
  badge,
  copy,
  index,
  onClick,
  title
}: {
  active: boolean
  badge?: string
  copy: string
  index: number
  onClick: () => void
  title: string
}): React.JSX.Element {
  return (
    <button
      aria-pressed={active}
      className={active ? 'settings-step-button active' : 'settings-step-button'}
      onClick={onClick}
      type="button"
    >
      <span className="settings-step-index">{String(index).padStart(2, '0')}</span>
      <span className="settings-step-copy">
        <strong>{title}</strong>
        <span>{copy}</span>
      </span>
      {badge ? <span className="workspace-badge">{badge}</span> : null}
    </button>
  )
}

export function SettingsDrawer({
  language,
  theme,
  uiScale,
  profiles,
  editingProfileId,
  profileForm,
  profileFormError,
  runtimeConfig,
  runtimeFormError,
  dependencyStatus,
  resetAppDataConfirmVisible,
  resetAppDataConfirmationText,
  onChangeLanguage,
  onChangeTheme,
  onChangeUiScale,
  onBeginEditProfile,
  onDeleteProfile,
  onBeginCreateProfile,
  onUpdateProfileForm,
  onSaveProfile,
  onUpdateRuntimeField,
  onSaveRuntimePaths,
  onUpdateResetText,
  onResetAppData
}: SettingsDrawerProps): React.JSX.Element {
  const { t } = useI18n()
  const languageOptions: AppLanguage[] = ['ko', 'en']
  const themeOptions: AppTheme[] = ['system', 'light', 'dark']
  const uiScaleOptions: AppUiScale[] = ['system', '90', '100', '110', '120']
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>(profiles.length === 0 ? 'profiles' : 'basics')
  const [profileEditorVisible, setProfileEditorVisible] = useState(profiles.length === 0)
  const showProfileEditor = profileEditorVisible || profiles.length === 0
  const selectSection = (section: SettingsSectionKey) => {
    runMotionSafeTransition(() => {
      setActiveSection(section)
    })
  }

  useEffect(() => {
    if (editingProfileId || profileFormError) {
      runMotionSafeTransition(() => {
        setActiveSection('profiles')
        setProfileEditorVisible(true)
      })
    }
  }, [editingProfileId, profileFormError])

  useEffect(() => {
    if (runtimeFormError || resetAppDataConfirmVisible) {
      runMotionSafeTransition(() => {
        setActiveSection('advanced')
      })
    }
  }, [resetAppDataConfirmVisible, runtimeFormError])

  return (
    <div className="workspace-screen settings-workspace">
      <WorkspaceHeader
        context={
          <>
          <span className="workspace-badge">{t('settings.profileCount', { count: profiles.length })}</span>
          </>
        }
        copy={t('settings.copy')}
        eyebrow={t('settings.title')}
        title={t('settings.title')}
      />

      <div className="settings-shell">
        <nav aria-label={t('settings.sections')} className="settings-step-list" data-active-section={activeSection}>
          <SettingsStepButton
            active={activeSection === 'basics'}
            copy={t('settings.applicationSummary')}
            index={1}
            onClick={() => selectSection('basics')}
            title={t('settings.application')}
          />
          <SettingsStepButton
            active={activeSection === 'profiles'}
            badge={t('settings.profileCount', { count: profiles.length })}
            copy={t('settings.profileDirectorySummary')}
            index={2}
            onClick={() => selectSection('profiles')}
            title={t('settings.profiles')}
          />
          <SettingsStepButton
            active={activeSection === 'advanced'}
            copy={t('settings.advancedSummary')}
            index={3}
            onClick={() => selectSection('advanced')}
            title={t('settings.advanced')}
          />
        </nav>

        <section className="settings-focus-panel" data-active-section={activeSection} key={activeSection}>
          {activeSection === 'basics' ? (
            <>
              <div className="settings-section-header">
                <div>
                  <span className="summary-label">{t('settings.application')}</span>
                  <strong>{t('settings.application')}</strong>
                </div>
                <p>{t('settings.applicationCopy')}</p>
              </div>

              <SettingsChoiceGroup
                label={t('settings.language')}
                onChange={onChangeLanguage}
                options={languageOptions.map((option) => ({
                  value: option,
                  label: t(`settings.language.${option}`)
                }))}
                value={language}
              />

              <SettingsChoiceGroup
                hint={t('settings.themeModeCopy')}
                label={t('settings.themeMode')}
                onChange={onChangeTheme}
                options={themeOptions.map((option) => ({
                  value: option,
                  label: t(`settings.theme.${option}`)
                }))}
                value={theme}
              />

              <SettingsChoiceGroup
                hint={t('settings.uiScaleCopy')}
                label={t('settings.uiScale')}
                onChange={onChangeUiScale}
                options={uiScaleOptions.map((option) => ({
                  value: option,
                  label: t(`settings.uiScale.${option}`)
                }))}
                value={uiScale}
              />
            </>
          ) : null}

          {activeSection === 'profiles' ? (
            <>
              <div className="settings-section-header">
                <div>
                  <span className="summary-label">{t('settings.profileDirectory')}</span>
                  <strong>{t('settings.profiles')}</strong>
                </div>
                <p>{t('settings.profileDirectoryCopy')}</p>
              </div>

              <div className="settings-panel-actions">
                <button
                  className="new-tab-button"
                  onClick={() => {
                    onBeginCreateProfile()
                    setProfileEditorVisible(true)
                  }}
                  type="button"
                >
                  {t('settings.newProfile')}
                </button>
              </div>

              <div className="settings-profile-list">
                {profiles.map((profile) => (
                  <div key={profile.id} className="settings-profile-card">
                    <div className="settings-profile-copy">
                      <strong>{profile.name}</strong>
                      <span>{profile.region}</span>
                    </div>
                    <div className="settings-profile-badges">
                      {profile.isDefault ? <span className="workspace-badge accent">{t('settings.defaultProfile')}</span> : null}
                    </div>
                    <div className="tunnel-builder-actions">
                      <button
                        className="toolbar-button"
                        onClick={() => {
                          onBeginEditProfile(profile)
                          setProfileEditorVisible(true)
                        }}
                        type="button"
                      >
                        {t('common.edit')}
                      </button>
                      <button className="toolbar-button" onClick={() => onDeleteProfile(profile.id)} type="button">
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {showProfileEditor ? (
                <div className="settings-panel-block">
                  <div className="settings-subsection-header">
                    <div>
                      <span className="summary-label">{t('settings.profileEditor')}</span>
                      <strong>{editingProfileId ? t('settings.profileEditorEdit') : t('settings.profileEditorCreate')}</strong>
                    </div>
                    <p>{t('settings.profileEditorCopy')}</p>
                  </div>

                  {profileFormError ? (
                    <div className="callout callout-error inline-callout">
                      <strong>{profileFormError}</strong>
                    </div>
                  ) : null}

                  <div className="profile-form settings-form-grid">
                    <SettingsField hint={t('settings.profileNameHint')} label={t('settings.profileName')}>
                      <input
                        className="tunnel-input"
                        onChange={(event) => onUpdateProfileForm({ name: event.target.value })}
                        placeholder={t('settings.profileNamePlaceholder')}
                        value={profileForm.name}
                      />
                    </SettingsField>
                    <SettingsField hint={t('settings.defaultRegionHint')} label={t('settings.defaultRegion')}>
                      <RegionPicker
                        ariaLabel={t('settings.defaultRegion')}
                        value={profileForm.region}
                        onChange={(region) => onUpdateProfileForm({ region })}
                      />
                    </SettingsField>
                    <SettingsField
                      hint={editingProfileId ? t('settings.accessKeyHint.edit') : t('settings.accessKeyHint.create')}
                      label={t('settings.accessKeyId')}
                    >
                      <input
                        className="tunnel-input"
                        onChange={(event) => onUpdateProfileForm({ accessKeyId: event.target.value })}
                        placeholder={t('settings.accessKeyPlaceholder')}
                        value={profileForm.accessKeyId}
                      />
                    </SettingsField>
                    <SettingsField
                      hint={editingProfileId ? t('settings.secretKeyHint.edit') : t('settings.secretKeyHint.create')}
                      label={t('settings.secretAccessKey')}
                    >
                      <input
                        className="tunnel-input"
                        onChange={(event) => onUpdateProfileForm({ secretAccessKey: event.target.value })}
                        placeholder={t('settings.secretAccessKey')}
                        type="password"
                        value={profileForm.secretAccessKey}
                      />
                    </SettingsField>
                    <SettingsField hint={t('settings.sessionTokenHint')} label={t('settings.sessionToken')}>
                      <input
                        className="tunnel-input"
                        onChange={(event) => onUpdateProfileForm({ sessionToken: event.target.value })}
                        placeholder={t('settings.sessionTokenPlaceholder')}
                        type="password"
                        value={profileForm.sessionToken}
                      />
                    </SettingsField>
                  </div>

                  <div className="tunnel-builder-actions">
                    <button className="new-tab-button" onClick={onSaveProfile} type="button">
                      {editingProfileId ? t('settings.updateProfile') : t('settings.saveProfile')}
                    </button>
                    {profiles.length > 0 ? (
                      <button
                        className="toolbar-button"
                        onClick={() => {
                          onBeginCreateProfile()
                          setProfileEditorVisible(false)
                        }}
                        type="button"
                      >
                        {t('common.cancel')}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {activeSection === 'advanced' ? (
            <>
              <div className="settings-section-header">
                <div>
                  <span className="summary-label">{t('settings.advanced')}</span>
                  <strong>{t('settings.advanced')}</strong>
                </div>
                <p>{t('settings.advancedCopy')}</p>
              </div>

              <div className="settings-panel-block">
                <div className="settings-subsection-header">
                  <div>
                    <span className="summary-label">{t('settings.localTools')}</span>
                    <strong>{t('settings.localTools')}</strong>
                  </div>
                  <p>{t('settings.localToolsCopy')}</p>
                </div>
                {runtimeFormError ? (
                  <div className="callout callout-error inline-callout">
                    <strong>{runtimeFormError}</strong>
                  </div>
                ) : null}
                <div className="profile-form settings-form-grid">
                  <div className="empty-card settings-runtime-card">
                    <strong>{t('settings.awsCliPath')}</strong>
                    <p>
                      {dependencyCaption(
                        t,
                        'settings.dependency.awsCli',
                        dependencyStatus.awsCli
                      )}
                    </p>
                  </div>
                  <SettingsField hint={t('settings.awsCliHint')} label={t('settings.awsCliPath')}>
                    <input
                      className="tunnel-input"
                      onChange={(event) => onUpdateRuntimeField('awsCliPath', event.target.value)}
                      placeholder="/opt/homebrew/bin/aws"
                      value={runtimeConfig.awsCliPath ?? ''}
                    />
                  </SettingsField>
                  <div className="empty-card settings-runtime-card">
                    <strong>{t('settings.sessionManagerPluginPath')}</strong>
                    <p>
                      {dependencyCaption(
                        t,
                        'settings.dependency.sessionManagerPlugin',
                        dependencyStatus.sessionManagerPlugin
                      )}
                    </p>
                  </div>
                  <SettingsField hint={t('settings.sessionManagerPluginHint')} label={t('settings.sessionManagerPluginPath')}>
                    <input
                      className="tunnel-input"
                      onChange={(event) => onUpdateRuntimeField('sessionManagerPluginPath', event.target.value)}
                      placeholder="/opt/homebrew/bin/session-manager-plugin"
                      value={runtimeConfig.sessionManagerPluginPath ?? ''}
                    />
                  </SettingsField>
                </div>
                <div className="tunnel-builder-actions">
                  <button className="new-tab-button" onClick={onSaveRuntimePaths} type="button">
                    {t('settings.saveRuntimePaths')}
                  </button>
                </div>
              </div>

              <div className="settings-panel-block">
                <div className="settings-subsection-header">
                  <div>
                    <span className="summary-label">{t('settings.resetSection')}</span>
                    <strong>{t('settings.resetSection')}</strong>
                  </div>
                  <p>{t('settings.resetCopy')}</p>
                </div>
                {resetAppDataConfirmVisible ? (
                  <div className="profile-form">
                    <SettingsField hint={t('settings.resetHint')} label={t('settings.resetConfirmation')}>
                      <input
                        className="tunnel-input"
                        onChange={(event) => onUpdateResetText(event.target.value)}
                        placeholder="RESET"
                        value={resetAppDataConfirmationText}
                      />
                    </SettingsField>
                    <div className="tunnel-builder-actions">
                      <button
                        className="toolbar-button"
                        disabled={resetAppDataConfirmationText !== 'RESET'}
                        onClick={onResetAppData}
                        type="button"
                      >
                        {t('settings.confirmReset')}
                      </button>
                      <button className="toolbar-button" onClick={() => onUpdateResetText('')} type="button">
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="tunnel-builder-actions">
                    <button className="toolbar-button" onClick={onResetAppData} type="button">
                      {t('settings.reset')}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  )
}
