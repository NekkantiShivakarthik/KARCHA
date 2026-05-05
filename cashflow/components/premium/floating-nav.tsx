import React, { useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WealthPathColors, Fonts } from '@/constants/theme';

export interface FloatingNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onPress?: () => void;
}

interface PremiumFloatingNavProps {
  items: FloatingNavItem[];
  activeId?: string;
  onItemPress?: (itemId: string) => void;
}

export function PremiumFloatingNav({
  items,
  activeId,
  onItemPress,
}: PremiumFloatingNavProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          bottom: insets.bottom + 12,
        },
      ]}
    >
      {/* Glassmorphism background */}
      <View style={styles.glassBack} />

      {/* Main nav container */}
      <View style={styles.navContainer}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => {
              onItemPress?.(item.id);
              item.onPress?.();
            }}
            style={({ pressed }) => [
              styles.navItem,
              activeId === item.id && styles.navItemActive,
              pressed && { opacity: 0.7 },
            ]}
          >
            {/* Icon container with glow on active */}
            <View
              style={[
                styles.iconContainer,
                activeId === item.id && styles.iconContainerActive,
              ]}
            >
              {activeId === item.id && (
                <View style={styles.activeGlow} />
              )}
              <View style={styles.iconWrapper}>{item.icon}</View>
            </View>

            {/* Label */}
            <Text
              style={[
                styles.label,
                activeId === item.id && styles.labelActive,
              ]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Border glow effect */}
      <View style={styles.borderGlow} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 100,
  },
  glassBack: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: WealthPathColors.frostedGlass,
    backdropFilter: Platform.OS === 'web' ? 'blur(30px)' : undefined,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    borderTopWidth: 1,
  },
  navContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  navItemActive: {
    // Active state styling
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 6,
    position: 'relative',
  },
  iconContainerActive: {
    backgroundColor: 'rgba(16, 200, 118, 0.2)',
    borderWidth: 1.5,
    borderColor: WealthPathColors.emeraldGreen,
  },
  activeGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: WealthPathColors.emeraldGreen,
    opacity: 0.08,
  },
  iconWrapper: {
    zIndex: 1,
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
  },
  labelActive: {
    color: WealthPathColors.emeraldGreen,
    fontWeight: '700',
  },
  borderGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundImage:
      Platform.OS === 'web'
        ? `linear-gradient(90deg, transparent, ${WealthPathColors.emeraldGreen}80, transparent)`
        : undefined,
    backgroundColor: 'rgba(16, 200, 118, 0.2)',
  },
});
