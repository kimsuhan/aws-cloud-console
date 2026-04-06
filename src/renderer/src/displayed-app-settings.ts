import type { AppLanguage, AppReadinessState, AppTheme, AppUiScale } from '@shared/contracts'

export interface LocalAppSettings {
  language: AppLanguage
  theme: AppTheme
  uiScale: AppUiScale
}

export interface DisplayedAppSettings {
  appLanguage: AppLanguage
  appTheme: AppTheme
  appUiScale: AppUiScale
}

function normalizeAppTheme(theme: AppTheme | null | undefined): AppTheme {
  return theme ?? 'system'
}

function normalizeAppUiScale(uiScale: AppUiScale | null | undefined): AppUiScale {
  return uiScale ?? 'system'
}

export function resolveDisplayedAppSettings(
  readiness: AppReadinessState,
  localSettings: LocalAppSettings
): DisplayedAppSettings {
  return {
    appLanguage: localSettings.language,
    appTheme: normalizeAppTheme(localSettings.theme),
    appUiScale: normalizeAppUiScale(localSettings.uiScale)
  }
}
