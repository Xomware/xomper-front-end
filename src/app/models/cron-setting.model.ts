/**
 * One row from the Supabase admin_cron_settings table.
 * Mirrors iOS CronSetting from CronSetting.swift.
 *
 * cronKey is the primary key (unique). description may be absent for
 * freshly-seeded rows without a human label.
 */
export interface CronSetting {
  cronKey: string
  enabled: boolean
  testMode: boolean
  description: string | null
  updatedAt: string | null   // ISO-8601
}

export interface CronSettingRaw {
  cron_key: string
  enabled?: boolean
  test_mode?: boolean
  description?: string | null
  updated_at?: string | null
}

export interface CronSettingsListResponse {
  count?: number
  rows: CronSettingRaw[]
  table_missing?: boolean
}

export interface CronSettingUpdateResponse {
  cron_key: string
  enabled: boolean
  test_mode: boolean
}

export function mapCronSetting(raw: CronSettingRaw): CronSetting {
  return {
    cronKey: raw.cron_key,
    enabled: raw.enabled ?? true,
    testMode: raw.test_mode ?? false,
    description: raw.description ?? null,
    updatedAt: raw.updated_at ?? null,
  }
}

export function mapCronSettingUpdate(raw: CronSettingUpdateResponse): Partial<CronSetting> {
  return {
    cronKey: raw.cron_key,
    enabled: raw.enabled,
    testMode: raw.test_mode,
  }
}

/** Fallback display title: prefer description, then cronKey. Mirrors iOS displayTitle. */
export function cronDisplayTitle(setting: CronSetting): string {
  return setting.description && setting.description.trim()
    ? setting.description
    : setting.cronKey
}
