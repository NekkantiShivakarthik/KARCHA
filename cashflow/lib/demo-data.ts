import { buildTransaction } from '@/lib/finance-ai';
import type { Transaction } from '@/lib/types';

const today = new Date();
const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

function currentMonthDate(day: number): string {
  return `${month}-${String(day).padStart(2, '0')}`;
}

export const demoTransactions: Transaction[] = [
  buildTransaction({
    merchant: 'Acme Payroll',
    amount: 5000,
    direction: 'income',
    date: currentMonthDate(1),
    note: 'Monthly salary',
  }),
  buildTransaction({
    merchant: 'Landlord Rent',
    amount: 1550,
    direction: 'expense',
    date: currentMonthDate(2),
  }),
  buildTransaction({
    merchant: 'Whole Foods',
    amount: 240,
    direction: 'expense',
    date: currentMonthDate(3),
  }),
  buildTransaction({
    merchant: 'Uber',
    amount: 85,
    direction: 'expense',
    date: currentMonthDate(4),
  }),
  buildTransaction({
    merchant: 'Netflix',
    amount: 18,
    direction: 'expense',
    date: currentMonthDate(5),
  }),
  buildTransaction({
    merchant: 'Spotify',
    amount: 12,
    direction: 'expense',
    date: currentMonthDate(5),
  }),
  buildTransaction({
    merchant: 'Starbucks',
    amount: 72,
    direction: 'expense',
    date: currentMonthDate(6),
  }),
  buildTransaction({
    merchant: 'DoorDash',
    amount: 144,
    direction: 'expense',
    date: currentMonthDate(8),
  }),
  buildTransaction({
    merchant: 'Amazon',
    amount: 189,
    direction: 'expense',
    date: currentMonthDate(10),
  }),
  buildTransaction({
    merchant: 'Vanguard',
    amount: 600,
    direction: 'expense',
    date: currentMonthDate(12),
    note: 'Index fund contribution',
  }),
];

