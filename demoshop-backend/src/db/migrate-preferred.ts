import db from './index';

async function main() {
  try {
    console.log('Running migrations...');
    await db.query(`
      ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS preferred_date DATE;
      ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS preferred_time VARCHAR(20);
      ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ;
      ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS arrival_deadline_at TIMESTAMPTZ;
      ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
      ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS service_started_at TIMESTAMPTZ;
      ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS service_ends_at TIMESTAMPTZ;
      ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ;
    `);
    console.log('Migration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await db.endPool();
  }
}

main();
