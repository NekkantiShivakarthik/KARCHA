import React, { useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  Pressable,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useFinance } from '@/context/finance-context';
import { WealthPathColors, Fonts } from '@/constants/theme';
import { NetCashflowCard } from '@/components/premium/net-cashflow-card';
import { Premium505020Bars } from '@/components/premium/budget-bars';
import { CategoryLeakRadar } from '@/components/premium/category-leak-radar';
import { PremiumFloatingNav } from '@/components/premium/floating-nav';

export default function WealthPathDashboard() {
  const { summary } = useFinance();
  const [activeNav, setActiveNav] = useState('dashboard');

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <Ionicons name="speedometer" size={20} color={WealthPathColors.emeraldGreen} />,
    },
    {
      id: 'transactions',
      label: 'Transactions',
      icon: <Ionicons name="swap-horizontal" size={20} color={WealthPathColors.emeraldGreen} />,
    },
    {
      id: 'insights',
      label: 'Insights',
      icon: <Ionicons name="bulb" size={20} color={WealthPathColors.emeraldGreen} />,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Ionicons name="settings" size={20} color={WealthPathColors.emeraldGreen} />,
    },
  ];

  const handleNavPress = (itemId: string) => {
    setActiveNav(itemId);
    // Navigation logic can be added here
    switch (itemId) {
      case 'transactions':
        router.push('/(tabs)/transactions');
        break;
      case 'insights':
        router.push('/(tabs)/insights');
        break;
      default:
        break;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.headerTitle}>WealthPath</Text>
          </View>
          <Pressable style={styles.notificationButton}>
            <Ionicons
              name="notifications"
              size={24}
              color={WealthPathColors.emeraldGreen}
            />
            <View style={styles.notificationDot} />
          </Pressable>
        </View>

        {/* Net Cashflow Card */}
        <NetCashflowCard />

        {/* Quick stats */}
        <View style={styles.quickStatsContainer}>
          <QuickStatCard
            label="Income"
            amount={`$${Math.round(summary.income)}`}
            icon="arrow-down"
            color={WealthPathColors.emeraldGreen}
          />
          <QuickStatCard
            label="Total Spend"
            amount={`$${Math.round(summary.needs + summary.wants)}`}
            icon="arrow-up"
            color={WealthPathColors.softAmber}
          />
          <QuickStatCard
            label="Savings"
            amount={`$${Math.round(summary.savings)}`}
            icon="trending-up"
            color={WealthPathColors.vibrantNeon}
          />
        </View>

        {/* 50/30/20 Budget Bars */}
        <Premium505020Bars />

        {/* Category Leak Radar */}
        <CategoryLeakRadar />

        {/* Budget Status Alert */}
        {summary.status !== 'on_track' && (
          <View
            style={[
              styles.alertCard,
              summary.status === 'at_risk'
                ? styles.alertWarning
                : styles.alertDanger,
            ]}
          >
            <Ionicons
              name={summary.status === 'at_risk' ? 'alert' : 'alert-circle'}
              size={20}
              color={
                summary.status === 'at_risk'
                  ? WealthPathColors.softAmber
                  : '#ff4444'
              }
            />
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>
                {summary.status === 'at_risk'
                  ? 'Budget At Risk'
                  : 'Budget Off Track'}
              </Text>
              <Text style={styles.alertMessage}>
                {summary.status === 'at_risk'
                  ? 'Your spending is approaching your budget limits'
                  : 'Your spending has exceeded your budget'}
              </Text>
            </View>
          </View>
        )}

        {/* Bottom spacing for floating nav */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Navigation */}
      <PremiumFloatingNav
        items={navItems}
        activeId={activeNav}
        onItemPress={handleNavPress}
      />
    </SafeAreaView>
  );
}

interface QuickStatCardProps {
  label: string;
  amount: string;
  icon: string;
  color: string;
}

function QuickStatCard({ label, amount, icon, color }: QuickStatCardProps) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <View style={styles.statContent}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statAmount}>{amount}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: WealthPathColors.darkCharcoal,
  },
  container: {
    flex: 1,
    backgroundColor: WealthPathColors.darkCharcoal,
  },
  contentContainer: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  greeting: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
  },
  headerTitle: {
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.95)',
    marginTop: 2,
  },
  notificationButton: {
    position: 'relative',
    padding: 8,
  },
  notificationDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: WealthPathColors.softAmber,
  },
  quickStatsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
    gap: 10,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WealthPathColors.charcoal,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WealthPathColors.lightSlateTeal,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statContent: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
  },
  statAmount: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  alertCard: {
    marginHorizontal: 16,
    marginVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  alertWarning: {
    backgroundColor: `${WealthPathColors.softAmber}15`,
    borderColor: `${WealthPathColors.softAmber}40`,
  },
  alertDanger: {
    backgroundColor: 'rgba(255, 68, 68, 0.15)',
    borderColor: 'rgba(255, 68, 68, 0.4)',
  },
  alertContent: {
    flex: 1,
    gap: 2,
  },
  alertTitle: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  alertMessage: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
  },
});
