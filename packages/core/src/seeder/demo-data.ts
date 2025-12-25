/**
 * Demo Data Seeder
 *
 * Populates vaults with realistic demo data for testing and demonstrations.
 */

import {
  VaultType,
  type TransactionContent,
  type BillContent,
  type HealthRecordContent,
  type ProfileContent,
  type DiaryEntryContent,
  type CalendarEventContent,
} from '@hman/shared';
import { HmanSDK } from '../sdk.js';

export interface SeederOptions {
  /** Include financial transactions */
  includeFinance?: boolean;
  /** Include health records */
  includeHealth?: boolean;
  /** Include diary entries */
  includeDiary?: boolean;
  /** Include calendar events */
  includeCalendar?: boolean;
  /** Number of months of historical data */
  monthsOfHistory?: number;
}

const DEFAULT_OPTIONS: Required<SeederOptions> = {
  includeFinance: true,
  includeHealth: true,
  includeDiary: true,
  includeCalendar: true,
  monthsOfHistory: 3,
};

/**
 * Seed demo data into an HMAN SDK instance
 */
export async function seedDemoData(
  sdk: HmanSDK,
  options: SeederOptions = {}
): Promise<{ itemCount: number; vaultCounts: Record<string, number> }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const vaultCounts: Record<string, number> = {};
  let totalCount = 0;

  // Seed identity profile
  await seedIdentity(sdk);
  vaultCounts.identity = 1;
  totalCount += 1;

  // Seed financial data
  if (opts.includeFinance) {
    const count = await seedFinance(sdk, opts.monthsOfHistory);
    vaultCounts.finance = count;
    totalCount += count;
  }

  // Seed health records
  if (opts.includeHealth) {
    const count = await seedHealth(sdk);
    vaultCounts.health = count;
    totalCount += count;
  }

  // Seed diary entries
  if (opts.includeDiary) {
    const count = await seedDiary(sdk, opts.monthsOfHistory);
    vaultCounts.diary = count;
    totalCount += count;
  }

  // Seed calendar events
  if (opts.includeCalendar) {
    const count = await seedCalendar(sdk);
    vaultCounts.calendar = count;
    totalCount += count;
  }

  return { itemCount: totalCount, vaultCounts };
}

async function seedIdentity(sdk: HmanSDK): Promise<void> {
  const profile: ProfileContent = {
    displayName: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    phone: '+61 400 123 456',
    dateOfBirth: '1990-05-15',
    address: {
      street: '42 Technology Drive',
      city: 'Sydney',
      state: 'NSW',
      postalCode: '2000',
      country: 'Australia',
    },
    languagePreference: 'en-AU',
    timezone: 'Australia/Sydney',
  };

  await sdk.addToVault(VaultType.Identity, 'profile', 'My Profile', profile);
}

async function seedFinance(sdk: HmanSDK, months: number): Promise<number> {
  const transactions: Array<{ title: string; content: TransactionContent }> = [];
  const bills: Array<{ title: string; content: BillContent }> = [];
  const now = new Date();

  // Generate transactions for the past N months
  const categories = [
    { category: 'groceries', merchants: ['Woolworths', 'Coles', 'Aldi'], range: [50, 200] },
    { category: 'utilities', subcategory: 'electricity', merchants: ['Energy Australia', 'Origin'], range: [100, 300] },
    { category: 'utilities', subcategory: 'gas', merchants: ['AGL', 'Origin'], range: [50, 150] },
    { category: 'utilities', subcategory: 'internet', merchants: ['Telstra', 'Optus'], range: [70, 120] },
    { category: 'transport', merchants: ['Uber', 'Opal Card', 'Shell', 'BP'], range: [20, 100] },
    { category: 'dining', merchants: ['Cafe Sydney', 'Grill\'d', 'Thai Poon'], range: [15, 80] },
    { category: 'entertainment', merchants: ['Netflix', 'Spotify', 'Event Cinemas'], range: [10, 50] },
    { category: 'health', merchants: ['Chemist Warehouse', 'Priceline'], range: [20, 100] },
    { category: 'shopping', merchants: ['Amazon', 'Kmart', 'Target'], range: [30, 200] },
  ];

  for (let m = 0; m < months; m++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - m, 1);

    // Add random transactions for each category
    for (const cat of categories) {
      const numTransactions = Math.floor(Math.random() * 4) + 1;
      for (let i = 0; i < numTransactions; i++) {
        const day = Math.floor(Math.random() * 28) + 1;
        const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
        const merchant = cat.merchants[Math.floor(Math.random() * cat.merchants.length)];
        const amount = Math.round((Math.random() * (cat.range[1] - cat.range[0]) + cat.range[0]) * 100) / 100;

        transactions.push({
          title: `${merchant} - ${cat.category}`,
          content: {
            type: 'expense',
            amount,
            currency: 'AUD',
            category: cat.category,
            subcategory: cat.subcategory,
            merchant,
            date: date.toISOString().split('T')[0],
          },
        });
      }
    }

    // Add income
    transactions.push({
      title: 'Salary - TechCorp',
      content: {
        type: 'income',
        amount: 6500,
        currency: 'AUD',
        category: 'salary',
        merchant: 'TechCorp Pty Ltd',
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 15).toISOString().split('T')[0],
        recurring: true,
      },
    });
  }

  // Add bills
  const billProviders = [
    { provider: 'Energy Australia', category: 'electricity', amount: 187.43 },
    { provider: 'Sydney Water', category: 'water', amount: 156.20 },
    { provider: 'Telstra', category: 'internet', amount: 89.00 },
    { provider: 'AGL', category: 'gas', amount: 78.50 },
  ];

  for (const bill of billProviders) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 14) + 7);

    bills.push({
      title: `${bill.provider} Bill`,
      content: {
        provider: bill.provider,
        amount: bill.amount,
        currency: 'AUD',
        dueDate: dueDate.toISOString().split('T')[0],
        category: bill.category,
        status: 'pending',
        invoiceNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      },
    });
  }

  // Add to vault
  for (const tx of transactions) {
    await sdk.addToVault(VaultType.Finance, 'transaction', tx.title, tx.content);
  }

  for (const bill of bills) {
    await sdk.addToVault(VaultType.Finance, 'bill', bill.title, bill.content);
  }

  return transactions.length + bills.length;
}

async function seedHealth(sdk: HmanSDK): Promise<number> {
  const records: Array<{ title: string; content: HealthRecordContent }> = [
    {
      title: 'Annual Check-up',
      content: {
        type: 'consultation',
        provider: 'Sydney Medical Centre',
        date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        summary: 'Routine annual health check. All vitals normal.',
        details: 'Blood pressure: 120/80, Heart rate: 72bpm, BMI: 24.5',
      },
    },
    {
      title: 'COVID-19 Vaccination',
      content: {
        type: 'vaccination',
        provider: 'Priceline Pharmacy',
        date: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        summary: 'COVID-19 Booster (Pfizer)',
        details: 'Lot number: FN1234, No adverse reactions',
      },
    },
    {
      title: 'Blood Test Results',
      content: {
        type: 'test_result',
        provider: 'Laverty Pathology',
        date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        summary: 'Full blood count - all results within normal range',
        details: 'Hemoglobin: 145 g/L, WBC: 6.5 x10^9/L, Platelets: 250 x10^9/L',
      },
    },
    {
      title: 'Prescription - Antihistamine',
      content: {
        type: 'prescription',
        provider: 'Dr. Sarah Chen',
        date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        summary: 'Loratadine 10mg daily for seasonal allergies',
        details: 'Take 1 tablet daily. Repeat x5',
      },
    },
  ];

  for (const record of records) {
    await sdk.addToVault(VaultType.Health, 'record', record.title, record.content);
  }

  return records.length;
}

async function seedDiary(sdk: HmanSDK, months: number): Promise<number> {
  const moods = ['happy', 'content', 'productive', 'tired', 'stressed', 'excited', 'calm'];
  const topics = [
    'Had a productive day at work. Finished the project ahead of schedule.',
    'Met up with friends for dinner. It was great to catch up.',
    'Started learning a new programming language. Feeling motivated.',
    'Went for a long walk in the park. The weather was perfect.',
    'Feeling overwhelmed with tasks. Need to prioritize better.',
    'Had a breakthrough on a problem I\'ve been working on.',
    'Quiet day at home. Read a good book and relaxed.',
    'Attended an interesting tech meetup. Made some new connections.',
    'Cooked a new recipe. It turned out really well!',
    'Reflecting on my goals for the year. Making good progress.',
  ];

  const entries: Array<{ title: string; content: DiaryEntryContent }> = [];
  const now = new Date();

  for (let m = 0; m < months; m++) {
    // Add 5-10 entries per month
    const numEntries = Math.floor(Math.random() * 6) + 5;
    const usedDays = new Set<number>();

    for (let i = 0; i < numEntries; i++) {
      let day: number;
      do {
        day = Math.floor(Math.random() * 28) + 1;
      } while (usedDays.has(day));
      usedDays.add(day);

      const date = new Date(now.getFullYear(), now.getMonth() - m, day);
      const mood = moods[Math.floor(Math.random() * moods.length)];
      const content = topics[Math.floor(Math.random() * topics.length)];

      entries.push({
        title: date.toLocaleDateString('en-AU', { weekday: 'long', month: 'short', day: 'numeric' }),
        content: {
          date: date.toISOString().split('T')[0],
          mood,
          content,
          tags: [mood, 'personal'],
        },
      });
    }
  }

  for (const entry of entries) {
    await sdk.addToVault(VaultType.Diary, 'entry', entry.title, entry.content);
  }

  return entries.length;
}

async function seedCalendar(sdk: HmanSDK): Promise<number> {
  const events: Array<{ title: string; content: CalendarEventContent }> = [];
  const now = new Date();

  // Add some upcoming events
  const upcomingEvents = [
    { title: 'Team Standup', hours: 24, duration: 0.5, recurring: true },
    { title: 'Project Review', hours: 48, duration: 1, location: 'Conference Room A' },
    { title: 'Dentist Appointment', hours: 72, duration: 1, location: 'Sydney Dental Care' },
    { title: 'Gym Session', hours: 24 * 3, duration: 1.5, recurring: true },
    { title: 'Coffee with Sarah', hours: 24 * 4, duration: 1, location: 'The Grounds, Alexandria' },
    { title: 'Annual Leave', hours: 24 * 14, duration: 24 * 5, description: 'Beach holiday' },
    { title: 'Tech Meetup', hours: 24 * 7, duration: 2, location: 'WeWork, Martin Place' },
    { title: 'Mom\'s Birthday', hours: 24 * 21, duration: 3, description: 'Family dinner' },
  ];

  for (const event of upcomingEvents) {
    const startTime = new Date(now.getTime() + event.hours * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + event.duration * 60 * 60 * 1000);

    events.push({
      title: event.title,
      content: {
        title: event.title,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        location: event.location,
        description: event.description,
        recurring: event.recurring ? {
          frequency: 'weekly',
          interval: 1,
        } : undefined,
      },
    });
  }

  for (const event of events) {
    await sdk.addToVault(VaultType.Calendar, 'event', event.title, event.content);
  }

  return events.length;
}

export { seedIdentity, seedFinance, seedHealth, seedDiary, seedCalendar };
