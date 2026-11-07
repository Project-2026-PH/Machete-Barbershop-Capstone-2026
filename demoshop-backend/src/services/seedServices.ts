import { serviceRepository } from '../repositories/service.repository';
import db from '../db/index';
import logger from '../utils/general/logger';

const services = [
  // Men's Grooming
  { title: "HAIR CUT", description: "Standard precision cut and style.", price: 250, category: "MEN'S GROOMING", sub_category: "Haircut", duration_minutes: 30 },
  { title: "HAIR CUT W/SHAMPOO", description: "Standard cut followed by a refreshing wash.", price: 300, category: "MEN'S GROOMING", sub_category: "Haircut", duration_minutes: 45 },
  // Treatment Services
  { title: "HAIR ART", description: "Creative hair designs. This includes a haircut", price: 0, category: "TREATMENT SERVICES", sub_category: "Hair Art", duration_minutes: 30 },
  { title: "HEAD SHAVE", description: "Smooth scalp shave.", price: 300, category: "TREATMENT SERVICES", sub_category: "Head Shave", duration_minutes: 30 },
  { title: "HAIR CUT + HOT OIL", description: "Precision cut with scalp treatment.", price: 750, category: "TREATMENT SERVICES", sub_category: "Haircut", duration_minutes: 60 },
  { title: "HAIR CUT + NATURAL COLOR", description: "Cut with natural tone coloring.", price: 850, category: "TREATMENT SERVICES", sub_category: "Haircut", duration_minutes: 90 },
  { title: "HAIR CUT + FASHION COLOR", description: "Cut with vibrant fashion shades.", price: 1500, category: "TREATMENT SERVICES", sub_category: "Haircut", duration_minutes: 120 },
  { title: "HAIR CUT + HIGHLIGHTS", description: "Dimensional highlights and cut.", price: 1500, category: "TREATMENT SERVICES", sub_category: "Haircut", duration_minutes: 120 },
  { title: "HAIR CUT + PASTEL COLOR", description: "Trend-focused pastel tones.", price: 2000, category: "TREATMENT SERVICES", sub_category: "Haircut", duration_minutes: 150 },
  { title: "HAIR PERM", description: "Texturizing perm service.", price: 1800, category: "TREATMENT SERVICES", sub_category: "Hair Perm", duration_minutes: 120 },
  // Special Promos
  { title: "THE STANDARD", description: "Haircut, Shampoo, Hot Towel, Face Cleanse Mask", price: 350, category: "SPECIAL PROMOS", sub_category: "Packages", duration_minutes: 45 },
  { title: "THE SUPERIOR", description: "The Standard + Beard Grooming", price: 450, category: "SPECIAL PROMOS", sub_category: "Packages", duration_minutes: 60 },
  { title: "THE ULTIMATE", description: "The Superior + Deep Cleansing Facial", price: 650, category: "SPECIAL PROMOS", sub_category: "Packages", duration_minutes: 75 },
  { title: "THE HAIR AND SCALP", description: "The Superior + Scalp Massage + Hair Moisturizer", price: 850, category: "SPECIAL PROMOS", sub_category: "Packages", duration_minutes: 90 },
  { title: "THE GRAND SLAM OVERALL", description: "The Superior + The Hair and Scalp + Deep Cleansing Facial", price: 1000, category: "SPECIAL PROMOS", sub_category: "Packages", duration_minutes: 120 },
];

const seedDB = async (): Promise<void> => {
  try {
    logger.info('Starting PostgreSQL seeding...');

    // Reset the table so you don't have duplicates during testing
    await db.query('TRUNCATE TABLE services RESTART IDENTITY CASCADE');
    logger.info("Previous services cleared.");

    for (const s of services) {
      await serviceRepository.create(s);
    }

    logger.info(` Success! Seeded ${services.length} services into demoshopdb.`);
    process.exit(0);
  } catch (err: any) {
    logger.error("Seeding failed:", err.message);
    process.exit(1);
  }
};

seedDB();
