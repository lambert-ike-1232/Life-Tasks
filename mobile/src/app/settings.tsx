import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { ErrorBanner } from '../components/ui';
import { ApiClient } from '../lib/api';
import { normalizeServerUrl } from '../lib/parse';
import { useSettings } from '../lib/settings';
import { useColors } from '../lib/theme';

export default function SettingsScreen() {
  const settings = useSettings();
  const c = useColors();
  const router = useRouter();
  const [url, setUrl] = useState(settings.serverUrl);
  const [key, setKey] = useState(settings.apiKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settings load asynchronously; fill the form once they arrive.
  useEffect(() => {
    setUrl(settings.serverUrl);
    setKey(settings.apiKey);
  }, [settings.serverUrl, settings.apiKey]);

  async function connect() {
    const base = normalizeServerUrl(url);
    if (!base) return setError('Enter your server address.');
    setBusy(true);
    setError(null);
    try {
      const workspaces = await new ApiClient(base, key.trim()).workspaces();
      if (!Array.isArray(workspaces)) throw new Error("That address answered, but it isn't a Life Tasks server.");
      await settings.save(base, key.trim());
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const field = [styles.field, { backgroundColor: c.panel, borderColor: c.line, color: c.text }];
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: settings.api ? 'Settings' : 'Connect' }} />

      <Text style={[styles.label, { color: c.muted }]}>Server address</Text>
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="https://life-tasks.example.com"
        placeholderTextColor={c.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={field}
      />
      <Text style={[styles.help, { color: c.muted }]}>
        Where the Life Tasks backend runs. On the same Wi-Fi as your computer, use its local IP, e.g.
        192.168.1.20:8000 (start the server with --host 0.0.0.0).
      </Text>

      <Text style={[styles.label, { color: c.muted }]}>API key</Text>
      <TextInput
        value={key}
        onChangeText={setKey}
        placeholder="Only if LIFE_TASKS_API_KEY is set"
        placeholderTextColor={c.muted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={field}
      />

      <ErrorBanner message={error} />

      <Pressable
        onPress={connect}
        disabled={busy}
        style={({ pressed }) => [styles.button, { backgroundColor: c.accent, opacity: pressed || busy ? 0.7 : 1 }]}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Connect</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  form: { padding: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 },
  field: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  help: { fontSize: 13, lineHeight: 18 },
  button: { marginTop: 20, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
