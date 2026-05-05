import type {
  BudgetStatus,
  BudgetSummary,
  Insight,
  Transaction,
  TransactionInput,
  CategoryTotal,
} from '@/lib/types';

type Rule = {
  keywords: string[];
  category: string;
  bucket: Transaction['bucket'];
  confidence: number;
  method: Transaction['classificationMethod'];
};

const RULES: Rule[] = [
  {
    keywords: ['rent', 'landlord', 'mortgage'],
    category: 'Housing',
    bucket: 'Needs',
    confidence: 0.95,
    method: 'rule',
  },
  {
    keywords: ['walmart', 'target', 'grocery', 'whole foods', 'aldi', 'trader joe'],
    category: 'Groceries',
    bucket: 'Needs',
    confidence: 0.93,
    method: 'rule',
  },
  {
    keywords: ['uber', 'lyft', 'shell', 'chevron', 'metro', 'transit'],
    category: 'Transport',
    bucket: 'Needs',
    confidence: 0.9,
    method: 'rule',
  },
  {
    keywords: ['netflix', 'spotify', 'disney', 'prime', 'youtube premium'],
    category: 'Subscriptions',
    bucket: 'Wants',
    confidence: 0.96,
    method: 'rule',
  },
  {
    keywords: ['starbucks', 'coffee', 'cafe', 'restaurant', 'doordash', 'swiggy'],
    category: 'Dining Out',
    bucket: 'Wants',
    confidence: 0.88,
    method: 'pattern',
  },
  {
    keywords: ['nike', 'adidas', 'mall', 'amazon', 'best buy'],
    category: 'Shopping',
    bucket: 'Wants',
    confidence: 0.85,
    method: 'pattern',
  },
  {
    keywords: ['vanguard', 'fidelity', 'robinhood', 'savings', 'emergency fund', 'student loan'],
    category: 'Future Goals',
    bucket: 'Savings',
    confidence: 0.9,
    method: 'pattern',
  },
  {
    keywords: ['salary', 'payroll', 'income', 'bonus', 'freelance'],
    category: 'Income',
    bucket: 'Income',
    confidence: 0.98,
    method: 'rule',
  },
];

function scoreStatus(needsRatio: number, wantsRatio: number, savingsRatio: number): BudgetStatus {
  const needsFlag = needsRatio <= 0.5 ? 0 : needsRatio <= 0.6 ? 1 : 2;
  const wantsFlag = wantsRatio <= 0.3 ? 0 : wantsRatio <= 0.4 ? 1 : 2;
  const savingsFlag = savingsRatio >= 0.2 ? 0 : savingsRatio >= 0.15 ? 1 : 2;
  const worst = Math.max(needsFlag, wantsFlag, savingsFlag);

  if (worst === 0) {
    return 'on_track';
  }
  if (worst === 1) {
    return 'at_risk';
  }
  return 'off_track';
}

function normalizeMerchant(merchant: string): string {
  return merchant.toLowerCase().replace(/\s+/g, ' ').trim();
}

function clampConfidence(confidence: number): number {
  return Math.max(0.5, Math.min(0.99, confidence));
}

export function classifyTransaction(input: TransactionInput): Pick<
  Transaction,
  'category' | 'bucket' | 'confidence' | 'classificationMethod' | 'explanation'
> {
  if (input.direction === 'income') {
    return {
      category: 'Income',
      bucket: 'Income',
      confidence: 0.99,
      classificationMethod: 'rule',
      explanation: 'Income transaction detected from cash direction.',
    };
  }

  const normalized = normalizeMerchant(input.merchant);

  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return {
        category: rule.category,
        bucket: rule.bucket,
        confidence: rule.confidence,
        classificationMethod: rule.method,
        explanation: `Matched "${rule.keywords.find((keyword) => normalized.includes(keyword))}" signal.`,
      };
    }
  }

  const amountSignal =
    input.amount > 500 ? { category: 'Bills', bucket: 'Needs' as const, confidence: 0.74 } : null;

  if (amountSignal) {
    return {
      category: amountSignal.category,
      bucket: amountSignal.bucket,
      confidence: amountSignal.confidence,
      classificationMethod: 'pattern',
      explanation: 'High-value expense pattern typically linked to fixed obligations.',
    };
  }

  return {
    category: 'Miscellaneous',
    bucket: 'Wants',
    confidence: 0.62,
    classificationMethod: 'pattern',
    explanation: 'No strong merchant pattern found, defaulting to discretionary spend.',
  };
}

function summarizeCategories(transactions: Transaction[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const tx of transactions) {
    if (tx.direction !== 'expense' || tx.bucket === 'Income') {
      continue;
    }
    const key = `${tx.bucket}:${tx.category}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        category: tx.category,
        amount: tx.amount,
        bucket: tx.bucket,
      });
      continue;
    }
    current.amount += tx.amount;
  }

  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function buildMonthlySummary(transactions: Transaction[], monthKey: string): BudgetSummary {
  const filtered = transactions.filter((tx) => tx.date.startsWith(monthKey));
  const income = filtered
    .filter((tx) => tx.direction === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const needs = filtered
    .filter((tx) => tx.direction === 'expense' && tx.bucket === 'Needs')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const wants = filtered
    .filter((tx) => tx.direction === 'expense' && tx.bucket === 'Wants')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const savings = filtered
    .filter((tx) => tx.direction === 'expense' && tx.bucket === 'Savings')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const denominator = income > 0 ? income : 1;
  const needsRatio = needs / denominator;
  const wantsRatio = wants / denominator;
  const savingsRatio = savings / denominator;
  const status = scoreStatus(needsRatio, wantsRatio, savingsRatio);
  const topCategories = summarizeCategories(filtered).slice(0, 4);

  return {
    monthKey,
    income,
    needs,
    wants,
    savings,
    needsRatio,
    wantsRatio,
    savingsRatio,
    status,
    netCashflow: income - needs - wants - savings,
    topCategories,
  };
}

function findSubscriptionCreep(transactions: Transaction[]): Insight[] {
  const recurringMap = new Map<string, number[]>();

  for (const tx of transactions) {
    if (tx.direction !== 'expense') {
      continue;
    }
    if (tx.category !== 'Subscriptions') {
      continue;
    }
    if (!recurringMap.has(tx.merchant)) {
      recurringMap.set(tx.merchant, []);
    }
    recurringMap.get(tx.merchant)?.push(tx.amount);
  }

  const insights: Insight[] = [];
  recurringMap.forEach((amounts, merchant) => {
    if (amounts.length < 2) {
      return;
    }
    const sorted = [...amounts].sort((a, b) => a - b);
    const baseline = sorted[0];
    const latest = sorted[sorted.length - 1];
    const diff = latest - baseline;
    if (diff < 3) {
      return;
    }
    insights.push({
      id: `sub-crew-${merchant}`,
      severity: diff > 10 ? 'high' : 'medium',
      title: 'Subscription creep detected',
      detail: `${merchant} increased by ${toCurrency(diff)} compared with prior billing.`,
      estimatedImpact: diff,
      action: `Review ${merchant} plan tier or pause for one month.`,
    });
  });

  return insights;
}

function findWantsSpike(summary: BudgetSummary): Insight[] {
  if (summary.income === 0) {
    return [];
  }

  if (summary.wantsRatio <= 0.3) {
    return [];
  }

  const overage = summary.wants - summary.income * 0.3;
  return [
    {
      id: `wants-spike-${summary.monthKey}`,
      severity: overage > 150 ? 'high' : 'medium',
      title: 'Wants spending is above 30%',
      detail: `Discretionary spending is running at ${(summary.wantsRatio * 100).toFixed(
        1
      )}% this month.`,
      estimatedImpact: overage,
      action: 'Cap dining and impulse shopping for the next 10 days to recover.',
    },
  ];
}

function findSavingsGap(summary: BudgetSummary): Insight[] {
  if (summary.income === 0) {
    return [];
  }

  if (summary.savingsRatio >= 0.2) {
    return [];
  }

  const gap = summary.income * 0.2 - summary.savings;
  return [
    {
      id: `save-gap-${summary.monthKey}`,
      severity: gap > 200 ? 'high' : 'medium',
      title: 'Savings target is behind pace',
      detail: `You are ${toCurrency(gap)} short of the 20% savings target this month.`,
      estimatedImpact: gap,
      action: 'Auto-transfer a fixed amount after next paycheck to close the gap.',
    },
  ];
}

function findCategoryLeak(summary: BudgetSummary): Insight[] {
  const topWant = summary.topCategories.find((item) => item.bucket === 'Wants');
  if (!topWant || summary.income === 0) {
    return [];
  }

  return [
    {
      id: `leak-${summary.monthKey}-${topWant.category}`,
      severity: 'low',
      title: `${topWant.category} is your top leak`,
      detail: `${toCurrency(topWant.amount)} spent in ${topWant.category} this month.`,
      estimatedImpact: topWant.amount * 0.2,
      action: `Trim ${topWant.category} by 20% next month to free up ${toCurrency(
        topWant.amount * 0.2
      )}.`,
    },
  ];
}

export function generateInsights(transactions: Transaction[], summary: BudgetSummary): Insight[] {
  const compiled = [
    ...findWantsSpike(summary),
    ...findSavingsGap(summary),
    ...findSubscriptionCreep(transactions),
    ...findCategoryLeak(summary),
  ];

  if (compiled.length === 0) {
    return [
      {
        id: `healthy-${summary.monthKey}`,
        severity: 'low',
        title: 'Budget balance looks healthy',
        detail: 'You are currently aligned with the 50/30/20 guardrails.',
        estimatedImpact: 0,
        action: 'Keep recurring checks weekly and continue current savings behavior.',
      },
    ];
  }

  return compiled.sort((a, b) => b.estimatedImpact - a.estimatedImpact);
}

import { getCurrency } from './currency';

export function toCurrency(value: number): string {
  const settings = getCurrency();
  return new Intl.NumberFormat(settings.locale || 'en-US', {
    style: 'currency',
    currency: settings.code,
    maximumFractionDigits:
      typeof settings.maximumFractionDigits === 'number' ? settings.maximumFractionDigits : 0,
  }).format(value);
}

export function buildTransaction(input: TransactionInput): Transaction {
  const classification = classifyTransaction(input);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    merchant: input.merchant.trim(),
    amount: Number(input.amount.toFixed(2)),
    date: input.date ?? new Date().toISOString().slice(0, 10),
    direction: input.direction,
    category: classification.category,
    bucket: classification.bucket,
    confidence: clampConfidence(classification.confidence),
    classificationMethod: classification.classificationMethod,
    explanation: classification.explanation,
    note: input.note?.trim() ? input.note.trim() : undefined,
  };
}

