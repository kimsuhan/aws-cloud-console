import path from 'node:path'

import { appUiScaleValues } from '../shared/contracts'
import type {
  AppLanguage,
  AppTheme,
  AppUiScale,
  CreateSavedShortcutRequest,
  CreateProfileRequest,
  ListS3ObjectsRequest,
  OpenSessionRequest,
  OpenTunnelSessionRequest,
  UpdateAppSettingsRequest,
  UpdateProfileRequest,
  UpdateRuntimePathsRequest
} from '../shared/contracts'

const INSTANCE_ID_PATTERN = /^i-(?:[0-9a-f]{8}|[0-9a-f]{17})$/
const AWS_REGION_PATTERN = /^[a-z]{2}(?:-[a-z]+)+-\d$/
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])$/
const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/
const CONTROL_OR_SHELL_PATTERN = /[\u0000-\u001f\u007f\s"'`$;&|<>\\()]/
const APP_LANGUAGE_VALUES: AppLanguage[] = ['ko', 'en']
const APP_THEME_VALUES: AppTheme[] = ['system', 'light', 'dark']
const APP_UI_SCALE_VALUES: AppUiScale[] = [...appUiScaleValues]

function assertNonEmptyString(value: string, label: string): void {
  if (!value.trim()) {
    throw new Error(`${label} is required.`)
  }
}

function validateS3PathPart(value: string, label: string): void {
  if (value.length > 255 || /[\\\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
}

export function validateAwsRegion(region: string): void {
  assertNonEmptyString(region, 'AWS region')
  if (!AWS_REGION_PATTERN.test(region)) {
    throw new Error(`Invalid AWS region: ${region}`)
  }
}

export function validateEc2InstanceId(instanceId: string, label: string): void {
  if (!INSTANCE_ID_PATTERN.test(instanceId)) {
    throw new Error(`Invalid EC2 instance ID for ${label}: ${instanceId}`)
  }
}

export function validateTcpPort(port: number, label: string): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ${label}: ${port}`)
  }
}

export function validateEndpoint(endpoint: string): void {
  assertNonEmptyString(endpoint, 'Target endpoint')
  if (CONTROL_OR_SHELL_PATTERN.test(endpoint)) {
    throw new Error(`Invalid target endpoint: ${endpoint}`)
  }

  if (!HOSTNAME_PATTERN.test(endpoint) && !IPV4_PATTERN.test(endpoint)) {
    throw new Error(`Invalid target endpoint: ${endpoint}`)
  }
}

export function validateAbsolutePath(filePath: string | null, label: string): void {
  if (!filePath) {
    return
  }

  if (!path.isAbsolute(filePath) || CONTROL_OR_SHELL_PATTERN.test(filePath)) {
    throw new Error(`${label} must be an absolute path.`)
  }
}

export function validateOpenSessionRequest(request: OpenSessionRequest): OpenSessionRequest {
  assertNonEmptyString(request.profileId, 'Profile')
  validateEc2InstanceId(request.instanceId, 'session target')
  validateTcpPort(request.cols, 'terminal cols')
  validateTcpPort(request.rows, 'terminal rows')
  return request
}

export function validateOpenTunnelSessionRequest(request: OpenTunnelSessionRequest): OpenTunnelSessionRequest {
  assertNonEmptyString(request.profileId, 'Profile')
  assertNonEmptyString(request.targetId, 'Tunnel target')
  validateEc2InstanceId(request.jumpInstanceId, 'tunnel jump instance')
  validateEndpoint(request.targetEndpoint)
  validateTcpPort(request.remotePort, 'remote port')
  validateTcpPort(request.localPort, 'local port')
  return request
}

export function validateCreateProfileRequest(request: CreateProfileRequest): CreateProfileRequest {
  validateAwsRegion(request.region)
  return request
}

export function validateUpdateProfileRequest(request: UpdateProfileRequest): UpdateProfileRequest {
  validateAwsRegion(request.region)
  return request
}

export function validateUpdateRuntimePathsRequest(request: UpdateRuntimePathsRequest): UpdateRuntimePathsRequest {
  validateAbsolutePath(request.awsCliPath, 'awsCliPath')
  validateAbsolutePath(request.sessionManagerPluginPath, 'sessionManagerPluginPath')
  return request
}

export function validateUpdateAppSettingsRequest(request: UpdateAppSettingsRequest): UpdateAppSettingsRequest {
  if (request.language !== undefined && request.language !== null && !APP_LANGUAGE_VALUES.includes(request.language)) {
    throw new Error(`Invalid app language: ${request.language}`)
  }

  if (request.theme !== undefined && request.theme !== null && !APP_THEME_VALUES.includes(request.theme)) {
    throw new Error(`Invalid app theme: ${request.theme}`)
  }

  if (request.uiScale !== undefined && request.uiScale !== null && !APP_UI_SCALE_VALUES.includes(request.uiScale)) {
    throw new Error(`Invalid app UI scale: ${request.uiScale}`)
  }

  if (request.selectedProfileId !== undefined && request.selectedProfileId !== null) {
    assertNonEmptyString(request.selectedProfileId, 'Selected profile')
  }

  return request
}

export function validateCreateSavedShortcutRequest(request: CreateSavedShortcutRequest): CreateSavedShortcutRequest {
  assertNonEmptyString(request.label, 'Shortcut label')
  assertNonEmptyString(request.profileId, 'Shortcut profile')
  assertNonEmptyString(request.profileName, 'Shortcut profile name')
  validateAwsRegion(request.region)

  if (request.launchKind === 'ssm') {
    validateEc2InstanceId(request.payload.instanceId, 'shortcut session target')
    assertNonEmptyString(request.payload.instanceName, 'Shortcut instance name')
    return request
  }

  validateEc2InstanceId(request.payload.jumpInstanceId, 'shortcut tunnel jump instance')
  assertNonEmptyString(request.payload.jumpInstanceName, 'Shortcut jump instance name')
  assertNonEmptyString(request.payload.targetId, 'Shortcut target')
  assertNonEmptyString(request.payload.targetName, 'Shortcut target name')
  validateEndpoint(request.payload.targetEndpoint)
  validateTcpPort(request.payload.remotePort, 'shortcut remote port')
  validateTcpPort(request.payload.preferredLocalPort, 'shortcut preferred local port')
  return request
}

export function validateListS3ObjectsRequest(request: ListS3ObjectsRequest): ListS3ObjectsRequest {
  assertNonEmptyString(request.profileId, 'Profile')
  assertNonEmptyString(request.bucketName, 'Bucket name')
  validateS3PathPart(request.prefix, 'S3 prefix')
  validateS3PathPart(request.query, 'S3 query')
  return request
}

export function shouldEnableRemoteDebugging(options: {
  remoteDebuggingPort: string | undefined
  isPackaged: boolean
  rendererUrl: string | undefined
}): string | null {
  if (!options.remoteDebuggingPort || options.isPackaged || !options.rendererUrl) {
    return null
  }

  const port = Number(options.remoteDebuggingPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null
  }

  return String(port)
}

export function buildProductionContentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'"
  ].join('; ')
}
