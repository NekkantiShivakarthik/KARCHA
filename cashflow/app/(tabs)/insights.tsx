import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useFinance } from '@/context/finance-context';
import { toCurrency } from '@/lib/finance-ai';

const SEVERITY_COLOR = {
  high: '#b9372f',
  medium: '#c77a00',
  low: '#2a7b67',
};

export default function InsightsScreen() {
  const { insights, summary } = useFinance();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>AI Savings Advisor</Text>
          <Text style={styles.heroBody}>
            Personalized nudges are generated from your monthly behavior and 50/30/20 performance.
          </Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Needs</Text>
            <Text style={styles.summaryValue}>{(summary.needsRatio * 100).toFixed(1)}%</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Wants</Text>
            <Text style={styles.summaryValue}>{(summary.wantsRatio * 100).toFixed(1)}%</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Savings</Text>
            <Text style={styles.summaryValue}>{(summary.savingsRatio * 100).toFixed(1)}%</Text>
          </View>
        </View>

        <View style={styles.insightList}>
          {insights.map((insight) => (
            <View key={insight.id} style={styles.insightCard}>
              <View style={styles.titleRow}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <View
                  style={[
                    styles.severityPill,
                    {
                      borderColor: SEVERITY_COLOR[insight.severity],
                      backgroundColor: `${SEVERITY_COLOR[insight.severity]}1A`,
                    },
                  ]}>
                  <Text style={[styles.severityText, { color: SEVERITY_COLOR[insight.severity] }]}>
                    {insight.severity.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.insightDetail}>{insight.detail}</Text>
              <Text style={styles.insightAction}>Action: {insight.action}</Text>
              <Text style={styles.impact}>Estimated impact: {toCurrency(insight.estimatedImpact)}</Text>
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
    padding: 16,
    gap: 14,
    paddingBottom: 28,
  },
  hero: {
    borderRadius: 24,
    backgroundColor: '#f4a261',
    borderWidth: 1,
    borderColor: '#d78e4e',
    padding: 16,
  },
  heroTitle: {
    fontSize: 25,
    color: '#3f2505',
    fontFamily: Fonts.rounded,
    marginBottom: 6,
  },
  heroBody: {
    color: '#613c11',
    lineHeight: 20,
    fontFamily: Fonts.sans,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e3d4bb',
    padding: 12,
    backgroundColor: '#fffaf1',
  },
  summaryLabel: {
    color: '#6d7b84',
    fontSize: 12,
    fontFamily: Fonts.sans,
    marginBottom: 4,
  },
  summaryValue: {
    color: '#132029',
    fontSize: 20,
    fontFamily: Fonts.rounded,
  },
  insightList: {
    gap: 10,
  },
  insightCard: {
    borderRadius: 16,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e8dbc4',
    padding: 12,
    gap: 7,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'flex-start',
  },
  insightTitle: {
    flex: 1,
    fontSize: 17,
    color: '#1f2933',
    fontFamily: Fonts.rounded,
  },
  severityPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  severityText: {
    fontSize: 10,
    letterSpacing: 0.8,
    fontFamily: Fonts.rounded,
  },
  insightDetail: {
    color: '#52626c',
    fontFamily: Fonts.sans,
    lineHeight: 20,
  },
  insightAction: {
    color: '#173843',
    fontFamily: Fonts.rounded,
  },
  impact: {
    color: '#70818a',
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
});

