import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Fonts } from '@/constants/theme';
import { useFinance } from '@/context/finance-context';
import { classifyTransaction, toCurrency } from '@/lib/finance-ai';
import type { BudgetBucket, CashDirection, Transaction } from '@/lib/types';

const BUCKET_COLORS: Record<string, string> = {
  Needs: '#264653',
  Wants: '#e76f51',
  Savings: '#2a9d8f',
  Income: '#245b2e',
};

function BucketBadge({ bucket }: { bucket: BudgetBucket }) {
  return (
    <View style={[styles.badge, { backgroundColor: `${BUCKET_COLORS[bucket]}1A`, borderColor: BUCKET_COLORS[bucket] }]}>
      <Text style={[styles.badgeText, { color: BUCKET_COLORS[bucket] }]}>{bucket}</Text>
    </View>
  );
}

type BucketOverrideProps = {
  tx: Transaction;
  onOverride: (bucket: Extract<Transaction['bucket'], 'Needs' | 'Wants' | 'Savings'>) => void;
};

function BucketOverride({ tx, onOverride }: BucketOverrideProps) {
  if (tx.direction !== 'expense') {
    return null;
  }

  const choices: Extract<Transaction['bucket'], 'Needs' | 'Wants' | 'Savings'>[] = [
    'Needs',
    'Wants',
    'Savings',
  ];

  return (
    <View style={styles.overrideRow}>
      {choices.map((choice) => {
        const active = tx.bucket === choice;
        return (
          <Pressable
            key={`${tx.id}-${choice}`}
            onPress={() => onOverride(choice)}
            style={[styles.choiceChip, active ? styles.choiceChipActive : null]}>
            <Text style={[styles.choiceChipText, active ? styles.choiceChipTextActive : null]}>
              {choice}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TransactionsScreen() {
  const { transactions, addTransaction, overrideClassification } = useFinance();
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<CashDirection>('expense');
  const [note, setNote] = useState('');

  const parsedAmount = Number(amount);
  const canSubmit = merchant.trim().length > 1 && Number.isFinite(parsedAmount) && parsedAmount > 0;

  const preview = useMemo(() => {
    if (!canSubmit) {
      return null;
    }
    return classifyTransaction({
      merchant,
      amount: parsedAmount,
      direction,
      note,
    });
  }, [canSubmit, merchant, parsedAmount, direction, note]);

  function handleAddTransaction() {
    if (!canSubmit) {
      return;
    }
    addTransaction({
      merchant,
      amount: parsedAmount,
      direction,
      note,
    });
    setMerchant('');
    setAmount('');
    setNote('');
    setDirection('expense');
  }

  function handleOverride(tx: Transaction, bucket: Extract<Transaction['bucket'], 'Needs' | 'Wants' | 'Savings'>) {
    const categoryByBucket: Record<typeof bucket, string> = {
      Needs: 'Essential Expenses',
      Wants: 'Lifestyle',
      Savings: 'Goal Funding',
    };

    overrideClassification({
      transactionId: tx.id,
      bucket,
      category: categoryByBucket[bucket],
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.formCard}>
            <Text style={styles.title}>Log Transaction</Text>
            <Text style={styles.subtitle}>AI will auto-tag category + bucket instantly.</Text>

            <View style={styles.toggleRow}>
              <Pressable
                style={[styles.toggleBtn, direction === 'expense' ? styles.toggleBtnActive : null]}
                onPress={() => setDirection('expense')}>
                <Text style={[styles.toggleText, direction === 'expense' ? styles.toggleTextActive : null]}>
                  Expense
                </Text>
              </Pressable>
              <Pressable
                style={[styles.toggleBtn, direction === 'income' ? styles.toggleBtnActive : null]}
                onPress={() => setDirection('income')}>
                <Text style={[styles.toggleText, direction === 'income' ? styles.toggleTextActive : null]}>
                  Income
                </Text>
              </Pressable>
            </View>

            <TextInput
              placeholder="Merchant (e.g., Starbucks)"
              placeholderTextColor="#8c9aa1"
              value={merchant}
              onChangeText={setMerchant}
              style={styles.input}
            />
            <TextInput
              placeholder="Amount (e.g., 24.99)"
              placeholderTextColor="#8c9aa1"
              value={amount}
              keyboardType="decimal-pad"
              onChangeText={setAmount}
              style={styles.input}
            />
            <TextInput
              placeholder="Optional note"
              placeholderTextColor="#8c9aa1"
              value={note}
              onChangeText={setNote}
              style={[styles.input, styles.noteInput]}
              multiline
            />

            {preview ? (
              <View style={styles.previewCard}>
                <Text style={styles.previewText}>
                  Predicted: {preview.category} ({preview.bucket}) | Confidence:{' '}
                  {(preview.confidence * 100).toFixed(0)}%
                </Text>
                <Text style={styles.previewExplanation}>{preview.explanation}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleAddTransaction}
              style={[styles.submitBtn, !canSubmit ? styles.submitBtnDisabled : null]}>
              <Text style={styles.submitText}>Add Transaction</Text>
            </Pressable>
          </View>

          <View style={styles.listCard}>
            <Text style={styles.title}>Recent Activity</Text>
            {transactions.length === 0 ? (
              <Text style={styles.empty}>No transactions yet. Add one above to start tracking.</Text>
            ) : null}
            {transactions.slice(0, 18).map((tx) => (
              <View key={tx.id} style={styles.txItem}>
                <View style={styles.txHead}>
                  <View style={styles.txLeft}>
                    <Text style={styles.txMerchant}>{tx.merchant}</Text>
                    <Text style={styles.txMeta}>
                      {tx.date} | {tx.category}
                    </Text>
                  </View>
                  <View style={styles.txRight}>
                    <Text
                      style={[
                        styles.txAmount,
                        tx.direction === 'income' ? styles.txAmountIncome : styles.txAmountExpense,
                      ]}>
                      {tx.direction === 'income' ? '+' : '-'}
                      {toCurrency(tx.amount)}
                    </Text>
                    <BucketBadge bucket={tx.bucket} />
                  </View>
                </View>
                <Text style={styles.txExplain}>
                  {tx.classificationMethod.toUpperCase()} | {(tx.confidence * 100).toFixed(0)}% | {tx.explanation}
                </Text>
                <BucketOverride tx={tx} onOverride={(bucket) => handleOverride(tx, bucket)} />
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f4f1ea',
  },
  flex: {
    flex: 1,
  },
  container: {
    padding: 16,
    gap: 16,
    paddingBottom: 28,
  },
  formCard: {
    borderRadius: 22,
    backgroundColor: '#fff9ee',
    borderColor: '#e9dcc7',
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  listCard: {
    borderRadius: 22,
    backgroundColor: '#fffdf8',
    borderColor: '#e9dcc7',
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  title: {
    fontSize: 22,
    color: '#1f2933',
    fontFamily: Fonts.rounded,
  },
  subtitle: {
    color: '#6f7c86',
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#efe4d3',
    borderRadius: 999,
    padding: 4,
    gap: 6,
  },
  toggleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 999,
  },
  toggleBtnActive: {
    backgroundColor: '#0b3c49',
  },
  toggleText: {
    color: '#445760',
    fontFamily: Fonts.rounded,
  },
  toggleTextActive: {
    color: '#f5fcff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#decfb7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: '#132029',
    fontFamily: Fonts.sans,
  },
  noteInput: {
    minHeight: 68,
    textAlignVertical: 'top',
  },
  previewCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#b9e2dc',
    backgroundColor: '#f1fbf9',
    padding: 10,
    gap: 4,
  },
  previewText: {
    color: '#0f4e4c',
    fontFamily: Fonts.rounded,
    fontSize: 13,
  },
  previewExplanation: {
    color: '#366a6b',
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  submitBtn: {
    backgroundColor: '#d97706',
    borderRadius: 999,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: '#fff9f0',
    fontFamily: Fonts.rounded,
    fontSize: 15,
  },
  empty: {
    color: '#6f7c86',
    fontFamily: Fonts.sans,
  },
  txItem: {
    borderWidth: 1,
    borderColor: '#ecdfca',
    borderRadius: 14,
    padding: 10,
    gap: 8,
    backgroundColor: '#fff',
  },
  txHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  txLeft: {
    flex: 1,
  },
  txRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  txMerchant: {
    fontSize: 16,
    color: '#1f2933',
    fontFamily: Fonts.rounded,
  },
  txMeta: {
    fontSize: 12,
    color: '#70818a',
    fontFamily: Fonts.sans,
  },
  txAmount: {
    fontSize: 18,
    fontFamily: Fonts.rounded,
  },
  txAmountExpense: {
    color: '#a83f31',
  },
  txAmountIncome: {
    color: '#1e6f3a',
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontFamily: Fonts.rounded,
  },
  txExplain: {
    fontSize: 11,
    color: '#728089',
    fontFamily: Fonts.sans,
  },
  overrideRow: {
    flexDirection: 'row',
    gap: 8,
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: '#d9ccba',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#fbf5ea',
  },
  choiceChipActive: {
    borderColor: '#0b3c49',
    backgroundColor: '#0b3c49',
  },
  choiceChipText: {
    color: '#596c76',
    fontSize: 11,
    fontFamily: Fonts.rounded,
  },
  choiceChipTextActive: {
    color: '#effdff',
  },
});

