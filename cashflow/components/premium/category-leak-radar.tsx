import { useMemo, useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { useFinance } from '@/context/finance-context';
import { WealthPathColors, Fonts } from '@/constants/theme';

interface HeatPoint {
  category: string;
  amount: number;
  percentage: number;
  intensity: number; // 0-1, higher = more intense/warning
}

export function CategoryLeakRadar() {
  const { summary } = useFinance();
  const animProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animProgress, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, []);

  // Calculate heat data from top categories
  const heatPoints: HeatPoint[] = useMemo(() => {
    const totalSpend = summary.topCategories.reduce((sum, cat) => sum + cat.amount, 0);
    return summary.topCategories.slice(0, 6).map((cat) => {
      const percentage = (cat.amount / totalSpend) * 100;
      // Intensity increases with percentage and amber if above 20%
      const intensity = Math.min(percentage / 30, 1);
      return {
        category: cat.category,
        amount: cat.amount,
        percentage,
        intensity,
      };
    });
  }, [summary.topCategories]);

  const totalAmount = heatPoints.reduce((sum, p) => sum + p.amount, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>CATEGORY LEAK RADAR</Text>
        <Text style={styles.subtitle}>Where your money is flowing</Text>
      </View>

      {/* Donut chart visualization */}
      <View style={styles.chartContainer}>
        <View style={styles.donutWrapper}>
          <Svg
            width={220}
            height={220}
            viewBox="0 0 220 220"
            style={styles.donutSvg}
          >
            <DonutChart data={heatPoints} animProgress={animProgress} />
          </Svg>

          {/* Center content */}
          <View style={styles.donutCenter}>
            <Text style={styles.centerAmount}>
              ${Math.round(totalAmount)}
            </Text>
            <Text style={styles.centerLabel}>Total Spend</Text>
          </View>
        </View>
      </View>

      {/* Heat legend */}
      <View style={styles.heatGrid}>
        {heatPoints.map((point, idx) => (
          <HeatCell key={idx} point={point} />
        ))}
      </View>
    </View>
  );
}

function DonutChart({
  data,
  animProgress,
}: {
  data: HeatPoint[];
  animProgress: Animated.Value;
}) {
  const colors = [
    WealthPathColors.emeraldGreen,
    WealthPathColors.softAmber,
    WealthPathColors.vibrantNeon,
    '#7c3aed', // violet
    '#06b6d4', // cyan
    '#f97316', // orange
  ];

  const total = data.reduce((sum, p) => sum + p.amount, 0);
  let currentAngle = -90;

  return (
    <>
      {data.map((point, idx) => {
        const sliceAngle = (point.amount / total) * 360;
        const animatedAngle = animProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [currentAngle, currentAngle],
        });

        const startAngle = currentAngle;
        const endAngle = currentAngle + sliceAngle;
        const start = polarToCartesian(110, startAngle);
        const end = polarToCartesian(110, endAngle);
        const largeArc = sliceAngle > 180 ? 1 : 0;

        const pathData = `
          M 110 110
          L ${start.x} ${start.y}
          A 110 110 0 ${largeArc} 1 ${end.x} ${end.y}
          Z
        `;

        currentAngle = endAngle;

        return (
          <Animated.View
            key={idx}
            style={{
              opacity: animProgress,
            }}
          >
            <Path
              d={pathData}
              fill={colors[idx % colors.length]}
              opacity={0.4 + point.intensity * 0.6}
            />
            <Path
              d={pathData}
              fill="none"
              stroke={colors[idx % colors.length]}
              strokeWidth={2}
              opacity={0.8}
            />
          </Animated.View>
        );
      })}
    </>
  );
}

function HeatCell({ point }: { point: HeatPoint }) {
  const intensityColors = [
    'rgba(16, 200, 118, 0.1)',
    'rgba(16, 200, 118, 0.3)',
    'rgba(255, 200, 87, 0.3)',
    'rgba(255, 200, 87, 0.5)',
  ];

  const getIntensityColor = (intensity: number) => {
    if (intensity < 0.25) return intensityColors[0];
    if (intensity < 0.5) return intensityColors[1];
    if (intensity < 0.75) return intensityColors[2];
    return intensityColors[3];
  };

  return (
    <View
      style={[
        styles.heatCell,
        {
          backgroundColor: getIntensityColor(point.intensity),
          borderColor: point.intensity > 0.6
            ? WealthPathColors.softAmber
            : WealthPathColors.emeraldGreen,
        },
      ]}
    >
      <Text style={styles.heatCellCategory}>{point.category}</Text>
      <Text style={styles.heatCellAmount}>${Math.round(point.amount)}</Text>
      <Text style={styles.heatCellPercent}>{point.percentage.toFixed(1)}%</Text>
    </View>
  );
}

function polarToCartesian(radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: 110 + radius * Math.cos(angleInRadians),
    y: 110 + radius * Math.sin(angleInRadians),
  };
}

// SVG stub - in real implementation, use react-native-svg
function Svg(props: any) {
  if (Platform.OS === 'web') {
    return <svg {...props} />;
  }
  return null;
}

function Path(props: any) {
  if (Platform.OS === 'web') {
    return <path {...props} />;
  }
  return null;
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
  chartContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  donutWrapper: {
    position: 'relative',
    width: 220,
    height: 220,
  },
  donutSvg: {
    width: '100%',
    height: '100%',
  },
  donutCenter: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -55,
    marginTop: -35,
    alignItems: 'center',
    zIndex: 1,
  },
  centerAmount: {
    fontFamily: Fonts.sans,
    fontSize: 24,
    fontWeight: '700',
    color: WealthPathColors.emeraldGreen,
  },
  centerLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  heatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 8,
  },
  heatCell: {
    flex: 1,
    minWidth: '48%',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  heatCellCategory: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 4,
  },
  heatCellAmount: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 2,
  },
  heatCellPercent: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
  },
});
