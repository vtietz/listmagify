import { serverEnv } from '@/lib/env';

type SyncTaskLimitConfig = {
  standardLimit: number | undefined;
  premiumLimit: number | undefined;
  premiumUserIds: readonly string[];
};

function configuredLimits(): SyncTaskLimitConfig {
  return {
    standardLimit: serverEnv.SYNC_MAX_TASKS_PER_USER,
    premiumLimit: serverEnv.SYNC_PREMIUM_MAX_TASKS_PER_USER,
    premiumUserIds: serverEnv.SYNC_PREMIUM_USER_IDS,
  };
}

/** Return the applicable saved-sync-task limit. Undefined means unlimited. */
export function getSyncTaskLimit(
  userIds: readonly string[],
  config: SyncTaskLimitConfig = configuredLimits(),
): number | undefined {
  const isPremium = userIds.some((id) => config.premiumUserIds.includes(id));
  if (!isPremium) return config.standardLimit;
  if (config.premiumLimit === undefined || config.standardLimit === undefined) return undefined;
  return Math.max(config.standardLimit, config.premiumLimit);
}
