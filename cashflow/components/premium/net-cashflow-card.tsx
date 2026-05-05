import { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { useFinance } from '@/context/finance-context';
import { toCurrency } from '@/lib/finance-ai';
import { WealthPathColors, Fonts } from '@/constants/theme';

export function NetCashflowCard() {
  const { summary } = useFinance();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 40,
        friction: 7,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const isPositive = summary.netCashflow >= 0;
  const accentColor = isPositive ? WealthPathColors.emeraldGreen : WealthPathColors.softAmber;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      {/* Glassmorphism background blur effect simulation */}
      <View style={styles.glassBackground} />

      {/* Accent glow */}
      <View
        style={[
          styles.glowAccent,
          {
            backgroundColor: accentColor,
            opacity: 0.1,
          },
        ]}
      />

      {/* Dark gradient overlay */}
      <View style={styles.gradientOverlay} />

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.label}>NET CASHFLOW</Text>

        <View style={styles.amountContainer}>
          <Text
            style={[
              styles.amount,
              {
                color: accentColor,
              },
            ]}
          >
            {toCurrency(summary.netCashflow)}
          </Text>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: accentColor,
                opacity: 0.2,
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                {
                  color: accentColor,
                },
              ]}
            >
              {isPositive ? '↑ Positive' : '↓ Warning'}
            </Text>
          </View>
        </View>

        {/* Period info */}
        <Text style={styles.periodText}>This Month</Text>
      </View>

      {/* Glowing border */}
      <View
        style={[
          styles.glowingBorder,
          {
            borderColor: accentColor,
            opacity: 0.3,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: WealthPathColors.lightSlateTeal,
    backgroundColor: WealthPathColors.charcoal,
  },
  glassBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: WealthPathColors.frostedGlass,
    backdropFilter: Platform.OS === 'web' ? 'blur(10px)' : undefined,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundImage:
      Platform.OS === 'web'
        ? `linear-gradient(135deg, ${WealthPathColors.charcoal}80 0%, ${WealthPathColors.slateTeal}40 100%)`
        : undefined,
    backgroundColor: WealthPathColors.charcoal,
  },
  glowAccent: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  content: {
    paddingHorizontal: 24,
    paddingVertical: 28,
    zIndex: 1,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 12,
  },
  amountContainer: {
    marginBottom: 16,
  },
  amount: {
    fontFamily: Fonts.sans,
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 12,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
  },
  periodText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
  },
  glowingBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
  },
});
