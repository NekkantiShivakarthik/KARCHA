import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { FinanceProvider } from '@/context/finance-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import CurrencyPicker from '@/components/ui/currency-picker';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <FinanceProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <CurrencyPicker />
      </FinanceProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
