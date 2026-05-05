import { createContext, useContext, useMemo, useState } from 'react';

import { buildMonthlySummary, buildTransaction, generateInsights } from '@/lib/finance-ai';
import { demoTransactions } from '@/lib/demo-data';
import type { BudgetSummary, Insight, Transaction, TransactionInput } from '@/lib/types';

type OverridePayload = {
  transactionId: string;
  category: string;
  bucket: Extract<Transaction['bucket'], 'Needs' | 'Wants' | 'Savings'>;
};

type FinanceContextValue = {
  activeMonth: string;
  transactions: Transaction[];
  summary: BudgetSummary;
  insights: Insight[];
  addTransaction: (input: TransactionInput) => void;
  overrideClassification: (payload: OverridePayload) => void;
  seedDemoData: () => void;
  clearTransactions: () => void;
};

const FinanceContext = createContext<FinanceContextValue | undefined>(undefined);

function getMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [activeMonth] = useState(getMonthKey());
  const [transactions, setTransactions] = useState<Transaction[]>(demoTransactions);

  const summary = useMemo(() => buildMonthlySummary(transactions, activeMonth), [transactions, activeMonth]);
  const insights = useMemo(() => generateInsights(transactions, summary), [transactions, summary]);

  function addTransaction(input: TransactionInput) {
    const tx = buildTransaction(input);
    setTransactions((prev) => [tx, ...prev]);
  }

  function overrideClassification(payload: OverridePayload) {
    setTransactions((prev) =>
      prev.map((tx) => {
        if (tx.id !== payload.transactionId) {
          return tx;
        }
        return {
          ...tx,
          category: payload.category,
          bucket: payload.bucket,
          confidence: 0.99,
          classificationMethod: 'manual',
          explanation: 'Classification manually overridden by user.',
        };
      })
    );
  }

  function seedDemoData() {
    setTransactions(demoTransactions);
  }

  function clearTransactions() {
    setTransactions([]);
  }

  const value = useMemo(
    () => ({
      activeMonth,
      transactions,
      summary,
      insights,
      addTransaction,
      overrideClassification,
      seedDemoData,
      clearTransactions,
    }),
    [activeMonth, transactions, summary, insights]
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) {
    throw new Error('useFinance must be used inside FinanceProvider');
  }
  return ctx;
}

