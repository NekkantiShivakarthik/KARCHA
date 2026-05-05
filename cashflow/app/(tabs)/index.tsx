import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useFinance } from '@/context/finance-context';
import { toCurrency } from '@/lib/finance-ai';
import { Fonts } from '@/constants/theme';

type RatioCardProps = {
  label: string;
  ratio: number;
  target: number;
  amount: number;
  color: string;
};

function RatioCard({ label, ratio, target, amount, color }: RatioCardProps) {
  const animated = useRef(new Animated.Value(0)).current;
  const bounded = Math.min(Math.max(ratio, 0), 1);

  useEffect(() => {
    Animated.timing(animated, {
      toValue: bounded,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [animated, bounded]);

  const width = animated.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.ratioCard}>
      <View style={styles.rowBetween}>
        <Text style={styles.ratioTitle}>{label}</Text>
        <Text style={styles.ratioValue}>{(ratio * 100).toFixed(1)}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.targetMarker, { left: `${target * 100}%` }]} />
        <Animated.View style={[styles.fill, { width, backgroundColor: color }]} />
      </View>
      <View style={styles.rowBetween}>
        <Text style={styles.ratioMeta}>Spent: {toCurrency(amount)}</Text>
        <Text style={styles.ratioMeta}>Target: {(target * 100).toFixed(0)}%</Text>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const { activeMonth, summary, seedDemoData, clearTransactions } = useFinance();

  const monthLabel = useMemo(() => {
    const [y, m] = activeMonth.split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [activeMonth]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <View style={styles.dotA} />
          <View style={styles.dotB} />
          <Text style={styles.eyebrow}>AI-Powered WealthPath</Text>
          <Text style={styles.heroTitle}>Your monthly money GPS</Text>
          <Text style={styles.heroSub}>
            Month: {monthLabel} | Status: {summary.status.replace('_', ' ').toUpperCase()}
          </Text>
          <View style={styles.heroStats}>
            <View>
              <Text style={styles.statLabel}>Net Cashflow</Text>
              <Text style={styles.statValue}>{toCurrency(summary.netCashflow)}</Text>
            </View>
            <View>
              <Text style={styles.statLabel}>Income</Text>
              <Text style={styles.statValue}>{toCurrency(summary.income)}</Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable style={[styles.actionBtn, styles.primaryBtn]} onPress={seedDemoData}>
              <Text style={styles.primaryBtnText}>Load Demo Data</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, styles.secondaryBtn]} onPress={clearTransactions}>
              <Text style={styles.secondaryBtnText}>Clear Data</Text>
            </Pressable>
          </View>
        </View>

        <RatioCard
          label="Needs"
          ratio={summary.needsRatio}
          target={0.5}
          amount={summary.needs}
          color="#264653"
        />
        <RatioCard
          label="Wants"
          ratio={summary.wantsRatio}
          target={0.3}
          amount={summary.wants}
          color="#e76f51"
        />
        <RatioCard
          label="Savings"
          ratio={summary.savingsRatio}
          target={0.2}
          amount={summary.savings}
          color="#2a9d8f"
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Category Leak Radar</Text>
          {summary.topCategories.length === 0 ? (
            <Text style={styles.emptyText}>No spending data for this month yet.</Text>
          ) : null}
          {summary.topCategories.map((item) => (
            <View key={`${item.bucket}-${item.category}`} style={styles.leakRow}>
              <View>
                <Text style={styles.leakCategory}>{item.category}</Text>
                <Text style={styles.leakBucket}>{item.bucket}</Text>
              </View>
              <Text style={styles.leakAmount}>{toCurrency(item.amount)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f4f1ea',
  },
  container: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 14,
  },
  hero: {
    marginTop: 10,
    backgroundColor: '#0b3c49',
    borderRadius: 26,
    padding: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#145466',
  },
  dotA: {
    position: 'absolute',
    top: -16,
    right: -22,
    width: 110,
    height: 110,
    borderRadius: 999,
    backgroundColor: '#2a9d8f',
    opacity: 0.18,
  },
  dotB: {
    position: 'absolute',
    bottom: -38,
    left: -12,
    width: 94,
    height: 94,
    borderRadius: 999,
    backgroundColor: '#f4a261',
    opacity: 0.2,
  },
  eyebrow: {
    color: '#d3ecf1',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    fontSize: 11,
    marginBottom: 6,
    fontFamily: Fonts.rounded,
  },
  heroTitle: {
    color: '#f8fcfd',
    fontSize: 28,
    lineHeight: 30,
    fontFamily: Fonts.rounded,
    marginBottom: 8,
  },
  heroSub: {
    color: '#d8eaee',
    fontSize: 13,
    marginBottom: 14,
    fontFamily: Fonts.sans,
  },
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  statLabel: {
    color: '#b8d3d9',
    fontSize: 12,
    marginBottom: 2,
    fontFamily: Fonts.sans,
  },
  statValue: {
    color: '#f4fdfd',
    fontSize: 22,
    fontFamily: Fonts.rounded,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    backgroundColor: '#2a9d8f',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#93b8c0',
  },
  primaryBtnText: {
    color: '#f7fffe',
    fontFamily: Fonts.rounded,
    fontSize: 13,
  },
  secondaryBtnText: {
    color: '#d7ebef',
    fontFamily: Fonts.rounded,
    fontSize: 13,
  },
  ratioCard: {
    backgroundColor: '#fffaf1',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eadfcd',
    padding: 14,
    gap: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratioTitle: {
    fontSize: 16,
    color: '#1f2933',
    fontFamily: Fonts.rounded,
  },
  ratioValue: {
    fontSize: 18,
    color: '#1f2933',
    fontFamily: Fonts.rounded,
  },
  track: {
    height: 15,
    borderRadius: 10,
    backgroundColor: '#e8dfd2',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    height: 15,
    borderRadius: 10,
  },
  targetMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#fff',
    opacity: 0.95,
    zIndex: 1,
  },
  ratioMeta: {
    fontSize: 12,
    color: '#54656f',
    fontFamily: Fonts.sans,
  },
  section: {
    backgroundColor: '#fff9ee',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eadfcd',
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#1f2933',
    fontFamily: Fonts.rounded,
  },
  emptyText: {
    color: '#6c7a83',
    fontFamily: Fonts.sans,
  },
  leakRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1e7d8',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leakCategory: {
    color: '#1f2933',
    fontSize: 15,
    fontFamily: Fonts.rounded,
  },
  leakBucket: {
    color: '#7a8b94',
    fontSize: 12,
    fontFamily: Fonts.sans,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  leakAmount: {
    color: '#122b34',
    fontSize: 16,
    fontFamily: Fonts.rounded,
  },
});

