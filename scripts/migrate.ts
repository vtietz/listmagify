#!/usr/bin/env node
/**
 * Database Migration Runner
 * 
 * Runs pending migrations for all databases (metrics, recs).
 * Called automatically on dev server startup and production deployment.
 * 
 * Usage:
 *   npx tsx scripts/migrate.ts [--status]
 */

import { getDb, getMetricsMigrationStatus, closeDb } from '@/lib/metrics/db';
import { getMetricsConfig } from '@/lib/metrics/env';
import { recsEnv, isRecsAvailable, getRecsMigrationStatus, closeRecsDb, getRecsDb } from '@/lib/recs';

const showStatus = process.argv.includes('--status');

function printStatus(name: string, status: ReturnType<typeof getMetricsMigrationStatus>) {
  if (!status) {
    console.debug(`[${name}] Database not enabled`);
    return;
  }
  
  console.debug(`[${name}] Migration Status:`);
  console.debug(`  Current version: ${status.currentVersion}`);
  console.debug(`  Latest version:  ${status.latestVersion}`);
  console.debug(`  Pending:         ${status.pendingCount}`);
  
  if (status.appliedMigrations.length > 0) {
    console.debug(`  Applied migrations:`);
    for (const m of status.appliedMigrations) {
      const date = new Date(m.applied_at * 1000).toISOString();
      console.debug(`    v${m.version}: ${m.name} (${date})`);
    }
  }
}

async function main() {
  console.debug('=== Database Migration Runner ===\n');
  
  // Metrics database
  const metricsConfig = getMetricsConfig();
  if (metricsConfig.enabled) {
    console.debug(`[metrics] Database path: ${metricsConfig.dbPath}`);
    
    if (showStatus) {
      // Just connecting triggers migrations via getDb()
      const db = getDb();
      if (db) {
        printStatus('metrics', getMetricsMigrationStatus());
      }
    } else {
      // getDb() automatically runs migrations
      const db = getDb();
      if (db) {
        console.debug('[metrics] Migrations applied (if any)');
      }
    }
  } else {
    console.debug('[metrics] Disabled (METRICS_ENABLED=false)');
  }
  
  console.debug('');
  
  // Recs database
  if (isRecsAvailable()) {
    console.debug(`[recs] Database path: ${recsEnv.RECS_DB_PATH}`);
    
    if (showStatus) {
      // Just connecting triggers migrations via getRecsDb()
      const db = getRecsDb();
      if (db) {
        printStatus('recs', getRecsMigrationStatus());
      }
    } else {
      // getRecsDb() automatically runs migrations
      const db = getRecsDb();
      if (db) {
        console.debug('[recs] Migrations applied (if any)');
      }
    }
  } else {
    console.debug('[recs] Disabled (RECS_ENABLED=false)');
  }
  
  // Cleanup
  closeDb();
  closeRecsDb();
  
  console.debug('\n=== Migration Complete ===');
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
