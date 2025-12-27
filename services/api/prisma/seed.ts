import 'dotenv/config';
import { BadgeGenerator } from '../src/common/utils/badge-generator.util';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
});

// Create the Adapter
const adapter = new PrismaPg(pool);

// Pass the adapter to PrismaClient
const prisma = new PrismaClient({
  adapter,
});

const badgeGenerator = new BadgeGenerator();

type RawBadge = {
  code: string;
  name: string;
  description: string;
  category: string;
  tier: number;
  xpReward: number;
  requirement: number;
  label: string;
  icon?: string;
};

async function main() {
  console.log('🌱 Seeding badges with BadgeGenerator...');

  const badges: RawBadge[] = [
    // HYDRATION
    {
      code: 'hydration_bronze',
      name: 'Hydration Beginner',
      description: 'Drank 2L of water in a single day',
      category: 'HYDRATION',
      tier: 1,
      xpReward: 50,
      requirement: 2000,
      label: 'Hydration',
      icon: '💧',
    },
    {
      code: 'hydration_silver',
      name: 'Hydration Enthusiast',
      description: 'Drank 2.5L of water in a single day',
      category: 'HYDRATION',
      tier: 2,
      xpReward: 100,
      requirement: 2500,
      label: 'Hydration',
      icon: '💧',
    },
    {
      code: 'hydration_gold',
      name: 'Hydration Champion',
      description: 'Drank 3L of water in a single day',
      category: 'HYDRATION',
      tier: 3,
      xpReward: 200,
      requirement: 3000,
      label: 'Hydration',
      icon: '💧',
    },
    {
      code: 'hydration_platinum',
      name: 'Hydration Master',
      description: 'Drank 4L of water in a single day',
      category: 'HYDRATION',
      tier: 4,
      xpReward: 500,
      requirement: 4000,
      label: 'Hydration',
      icon: '💧',
    },

    // CLEAN EATING STREAKS
    {
      code: 'clean_streak_3',
      name: 'Clean Start',
      description: '3-day clean eating streak',
      category: 'STREAK',
      tier: 1,
      xpReward: 100,
      requirement: 3,
      label: 'Clean',
      icon: '🥗',
    },
    {
      code: 'clean_streak_7',
      name: 'Clean Week',
      description: '7-day clean eating streak',
      category: 'STREAK',
      tier: 2,
      xpReward: 300,
      requirement: 7,
      label: 'Clean',
      icon: '🥗',
    },
    {
      code: 'clean_streak_14',
      name: 'Clean Fortnight',
      description: '14-day clean eating streak',
      category: 'STREAK',
      tier: 3,
      xpReward: 750,
      requirement: 14,
      label: 'Clean',
      icon: '🥗',
    },
    {
      code: 'clean_streak_30',
      name: 'Clean Month',
      description: '30-day clean eating streak',
      category: 'STREAK',
      tier: 4,
      xpReward: 2000,
      requirement: 30,
      label: 'Clean',
      icon: '🥗',
    },

    // PRODUCT SCANS
    {
      code: 'scanner_novice',
      name: 'Scanner Novice',
      description: 'Scanned 10 products',
      category: 'SCAN',
      tier: 1,
      xpReward: 50,
      requirement: 10,
      label: 'Scan',
      icon: '📷',
    },
    {
      code: 'scanner_pro',
      name: 'Scanner Pro',
      description: 'Scanned 50 products',
      category: 'SCAN',
      tier: 2,
      xpReward: 200,
      requirement: 50,
      label: 'Scan',
      icon: '📷',
    },
    {
      code: 'scanner_expert',
      name: 'Scanner Expert',
      description: 'Scanned 100 products',
      category: 'SCAN',
      tier: 3,
      xpReward: 500,
      requirement: 100,
      label: 'Scan',
      icon: '📷',
    },
    {
      code: 'scanner_master',
      name: 'Scanner Master',
      description: 'Scanned 250 products',
      category: 'SCAN',
      tier: 4,
      xpReward: 1500,
      requirement: 250,
      label: 'Scan',
      icon: '📷',
    },

    // LOGIN STREAKS
    {
      code: 'login_streak_3',
      name: 'Consistent Beginner',
      description: 'Logged in 3 days in a row',
      category: 'LOGIN',
      tier: 1,
      xpReward: 75,
      requirement: 3,
      label: 'Login',
      icon: '🔥',
    },
    {
      code: 'login_streak_7',
      name: 'Weekly Warrior',
      description: 'Logged in 7 days in a row',
      category: 'LOGIN',
      tier: 2,
      xpReward: 250,
      requirement: 7,
      label: 'Login',
      icon: '🔥',
    },
    {
      code: 'login_streak_14',
      name: 'Dedicated User',
      description: 'Logged in 14 days in a row',
      category: 'LOGIN',
      tier: 3,
      xpReward: 600,
      requirement: 14,
      label: 'Login',
      icon: '🔥',
    },
    {
      code: 'login_streak_30',
      name: 'Commitment Champion',
      description: 'Logged in 30 days in a row',
      category: 'LOGIN',
      tier: 4,
      xpReward: 1500,
      requirement: 30,
      label: 'Login',
      icon: '🔥',
    },
    // TOTAL LOGINS
    {
      code: 'total_logins_10',
      name: 'Getting Started',
      description: 'Total of 10 logins',
      category: 'LOGIN',
      tier: 1,
      xpReward: 50,
      requirement: 10,
      label: 'Logins',
      icon: '📅',
    },
    {
      code: 'total_logins_50',
      name: 'Regular User',
      description: 'Total of 50 logins',
      category: 'LOGIN',
      tier: 2,
      xpReward: 300,
      requirement: 50,
      label: 'Logins',
      icon: '📅',
    },
    {
      code: 'total_logins_100',
      name: 'Loyal User',
      description: 'Total of 100 logins',
      category: 'LOGIN',
      tier: 3,
      xpReward: 800,
      requirement: 100,
      label: 'Logins',
      icon: '📅',
    },
    {
      code: 'total_logins_365',
      name: 'Year-Long Dedication',
      description: 'Total of 365 logins',
      category: 'LOGIN',
      tier: 4,
      xpReward: 3000,
      requirement: 365,
      label: 'Logins',
      icon: '🏆',
    },

    // SPECIAL
    {
      code: 'first_scan',
      name: 'First Steps',
      description: 'Completed your first product scan',
      category: 'SPECIAL',
      tier: 1,
      xpReward: 25,
      requirement: 1,
      label: 'First',
      icon: '✨',
    },
    {
      code: 'profile_complete',
      name: 'Profile Perfectionist',
      description: 'Completed your full profile',
      category: 'SPECIAL',
      tier: 1,
      xpReward: 100,
      requirement: 1,
      label: 'Profile',
      icon: '🧩',
    },
    {
      code: 'early_bird',
      name: 'Early Bird',
      description: 'Logged activity before 7 AM',
      category: 'SPECIAL',
      tier: 2,
      xpReward: 150,
      requirement: 1,
      label: 'Early',
      icon: '🌅',
    },
    {
      code: 'night_owl',
      name: 'Night Owl',
      description: 'Logged activity after 10 PM',
      category: 'SPECIAL',
      tier: 2,
      xpReward: 150,
      requirement: 1,
      label: 'Night',
      icon: '🦉',
    },
    {
      code: 'perfect_week',
      name: 'Perfect Week',
      description: 'Met all daily goals for 7 consecutive days',
      category: 'SPECIAL',
      tier: 3,
      xpReward: 1000,
      requirement: 7,
      label: 'Perfect',
      icon: '⭐',
    },
    {
      code: 'comeback_king',
      name: 'Comeback King',
      description: 'Returned after 30 days of inactivity',
      category: 'SPECIAL',
      tier: 2,
      xpReward: 500,
      requirement: 1,
      label: 'Return',
      icon: '🔄',
    },
  ];

  for (const badge of badges) {
    const { label, icon, ...dbData } = badge;
    const imageUrl = badgeGenerator.generateBadge(badge.tier, label, icon);

    await prisma.badge.upsert({
      where: { code: badge.code },
      update: {
        ...dbData,
        imageUrl,
      },
      create: {
        ...dbData,
        imageUrl,
      },
    });
  }

  console.log(`✅ Seeded ${badges.length} badges`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
