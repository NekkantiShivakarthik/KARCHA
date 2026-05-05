export type BudgetBucket = 'Needs' | 'Wants' | 'Savings' | 'Income';

export type CashDirection = 'income' | 'expense';

export type ClassificationMethod = 'rule' | 'pattern' | 'manual';

export type BudgetStatus = 'on_track' | 'at_risk' | 'off_track';

export interface Transaction {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  direction: CashDirection;
  category: string;
  bucket: BudgetBucket;
  confidence: number;
  classificationMethod: ClassificationMethod;
  explanation: string;
  note?: string;
}

export interface CategoryTotal {
  category: string;
  amount: number;
  bucket: Exclude<BudgetBucket, 'Income'>;
}

export interface BudgetSummary {
  monthKey: string;
  income: number;
  needs: number;
  wants: number;
  savings: number;
  needsRatio: number;
  wantsRatio: number;
  savingsRatio: number;
  status: BudgetStatus;
  netCashflow: number;
  topCategories: CategoryTotal[];
}

export interface Insight {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  estimatedImpact: number;
  action: string;
}

export interface TransactionInput {
  merchant: string;
  amount: number;
  date?: string;
  direction: CashDirection;
  note?: string;
}

