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
    console.log(`[${name}] Database not enabled`);
    return;
  }
  
  console.log(`[${name}] Migration Status:`);
  console.log(`  Current version: ${status.currentVersion}`);
  console.log(`  Latest version:  ${status.latestVersion}`);
  console.log(`  Pending:         ${status.pendingCount}`);
  
  if (status.appliedMigrations.length > 0) {
    console.log(`  Applied migrations:`);
    for (const m of status.appliedMigrations) {
      const date = new Date(m.applied_at * 1000).toISOString();
      console.log(`    v${m.version}: ${m.name} (${date})`);
    }
  }
}

async function main() {
  console.log('=== Database Migration Runner ===\n');
  
  // Metrics database
  const metricsConfig = getMetricsConfig();
  if (metricsConfig.enabled) {
    console.log(`[metrics] Database path: ${metricsConfig.dbPath}`);
    
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
        console.log('[metrics] Migrations applied (if any)');
      }
    }
  } else {
    console.log('[metrics] Disabled (METRICS_ENABLED=false)');
  }
  
  console.log('');
  
  // Recs database
  if (isRecsAvailable()) {
    console.log(`[recs] Database path: ${recsEnv.RECS_DB_PATH}`);
    
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
        console.log('[recs] Migrations applied (if any)');
      }
    }
  } else {
    console.log('[recs] Disabled (RECS_ENABLED=false)');
  }
  
  // Cleanup
  closeDb();
  closeRecsDb();
  
  console.log('\n=== Migration Complete ===');
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
