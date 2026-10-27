import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { useColors } from '../lib/theme';

/** A single-line input that submits on return and clears on success. */
export function AddBar({ placeholder, onSubmit }: { placeholder: string; onSubmit: (text: string) => Promise<void> }) {
  const c = useColors();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(text);
      setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.wrap, { backgroundColor: c.panel, borderColor: c.line }]}>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        returnKeyType="done"
        submitBehavior="submit"
        autoCapitalize="sentences"
        style={[styles.input, { color: c.text }]}
      />
      {busy && <ActivityIndicator />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 10 },
});
