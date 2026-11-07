import fs from 'fs';
import path from 'path';
import db from './index';

async function main() {
  try {
    console.log('Reading seed.sql...');
    const seedPath = path.join(__dirname, '..', '..', '..', 'supabase', 'seed.sql');
    const sql = fs.readFileSync(seedPath, 'utf8');
    
    console.log('Executing seed SQL on target database...');
    await db.query(sql);
    console.log('Database seeded successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  } finally {
    await db.endPool();
  }
}

main();
