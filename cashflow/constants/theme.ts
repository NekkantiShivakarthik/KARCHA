/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0b3c49';
const tintColorDark = '#fff';

// WealthPath Premium Color Palette
export const WealthPathColors = {
  // Base palette
  charcoal: '#1a1f26',
  darkCharcoal: '#0f1318',
  slateTeal: '#2d4a54',
  lightSlateTeal: '#3d5a64',
  
  // Accent colors
  emeraldGreen: '#10c876', // Positive cashflow
  softAmber: '#ffc857', // Warnings
  vibrantNeon: '#00ff88',
  
  // Neutral
  frostedGlass: 'rgba(255, 255, 255, 0.1)',
  frostedGlassDark: 'rgba(255, 255, 255, 0.08)',
  
  // Gradients
  gradientStart: '#1a1f26',
  gradientEnd: '#2d4a54',
};

export const Colors = {
  light: {
    text: '#16232c',
    background: '#f4f1ea',
    tint: tintColorLight,
    icon: '#6f7f88',
    tabIconDefault: '#6f7f88',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'sans-serif-medium',
    mono: 'monospace',
  },
  web: {
    sans: "'Avenir Next', 'Trebuchet MS', 'Segoe UI', sans-serif",
    serif: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
    rounded: "'Avenir Next Rounded', 'Trebuchet MS', 'Gill Sans', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
