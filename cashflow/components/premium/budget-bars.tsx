import { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  Platform,
  ScrollView,
} from 'react-native';
import { useFinance } from '@/context/finance-context';
import { WealthPathColors, Fonts } from '@/constants/theme';

interface BudgetBarProps {
  label: string;
  ratio: number;
  target: number;
  amount: string;
  color: string;
  delay: number;
}

function PremiumBudgetBar({
  label,
  ratio,
  target,
  amount,
  color,
  delay,
}: BudgetBarProps) {
  const animated = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const bounded = Math.min(Math.max(ratio, 0), 1);

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.spring(animated, {
        toValue: bounded,
        useNativeDriver: false,
        tension: 50,
        friction: 8,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, [animated, bounded]);

  const width = animated.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.8, 0.3],
  });

  return (
    <View style={styles.barContainer}>
      <View style={styles.barHeader}>
        <Text style={styles.barLabel}>{label}</Text>
        <View style={styles.barStats}>
          <Text style={styles.barPercentage}>{(ratio * 100).toFixed(1)}%</Text>
          <Text style={styles.barAmount}>{amount}</Text>
        </View>
      </View>

      {/* Target marker line */}
      <View style={styles.trackContainer}>
        <View style={styles.track}>
          {/* Target indicator */}
          <View
            style={[
              styles.targetMarker,
              {
                left: `${target * 100}%`,
              },
            ]}
          />

          {/* Main fill bar with glow */}
          <Animated.View
            style={[
              styles.glowBar,
              {
                width,
                backgroundColor: color,
                opacity: glowOpacity,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.fillBar,
              {
                width,
                backgroundColor: color,
              },
            ]}
          />

          {/* Indicator dot at end */}
          <Animated.View
            style={[
              styles.indicatorDot,
              {
                left: width,
                backgroundColor: color,
                opacity: ratio > 0 ? 1 : 0,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

export function Premium505020Bars() {
  const { summary } = useFinance();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>50/30/20 BUDGET</Text>
        <Text style={styles.subtitle}>Your budget allocation</Text>
      </View>

      <View style={styles.barsWrapper}>
        <PremiumBudgetBar
          label="Needs"
          ratio={summary.needsRatio}
          target={0.5}
          amount={`₹${Math.round(summary.needs)}`}
          color={WealthPathColors.emeraldGreen}
          delay={100}
        />
        <PremiumBudgetBar
          label="Wants"
          ratio={summary.wantsRatio}
          target={0.3}
          amount={`₹${Math.round(summary.wants)}`}
          color={WealthPathColors.softAmber}
          delay={200}
        />
        <PremiumBudgetBar
          label="Savings"
          ratio={summary.savingsRatio}
          target={0.2}
          amount={`₹${Math.round(summary.savings)}`}
          color={WealthPathColors.vibrantNeon}
          delay={300}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 16,
    backgroundColor: WealthPathColors.charcoal,
    borderWidth: 1,
    borderColor: WealthPathColors.lightSlateTeal,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '400',
  },
  barsWrapper: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 24,
  },
  barContainer: {
    gap: 8,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  barLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  barStats: {
    alignItems: 'flex-end',
    gap: 4,
  },
  barPercentage: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  barAmount: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  trackContainer: {
    overflow: 'hidden',
    borderRadius: 8,
  },
  track: {
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  targetMarker: {
    position: 'absolute',
    width: 2,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    top: 0,
    zIndex: 2,
  },
  glowBar: {
    position: 'absolute',
    height: '100%',
    borderRadius: 8,
    filter: Platform.OS === 'web' ? 'blur(4px)' : undefined,
  },
  fillBar: {
    height: '100%',
    borderRadius: 8,
  },
  indicatorDot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: WealthPathColors.charcoal,
    top: -2,
    marginLeft: -8,
  },
});
