import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { SettingsProvider } from '../lib/settings';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SettingsProvider>
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen name="index" options={{ title: 'Life Tasks', headerLargeTitle: true }} />
          <Stack.Screen name="list/[id]" options={{ title: '' }} />
          <Stack.Screen name="task/[id]" options={{ title: 'Task', presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
        </Stack>
      </SettingsProvider>
    </ThemeProvider>
  );
}
