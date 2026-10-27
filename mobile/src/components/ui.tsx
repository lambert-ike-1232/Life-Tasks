import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '../lib/theme';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: c.chip }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: c.panel }]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, { color: active ? c.text : c.muted }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  const c = useColors();
  if (!message) return null;
  return (
    <View style={[styles.banner, { borderColor: c.danger }]}>
      <Text style={{ color: c.danger }}>{message}</Text>
    </View>
  );
}

export function HeaderButton({ title, onPress, bold }: { title: string; onPress: () => void; bold?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <Text style={{ color: c.accent, fontSize: 17, fontWeight: bold ? '600' : '400' }}>{title}</Text>
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  const c = useColors();
  return <Text style={[styles.empty, { color: c.muted }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  segmented: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  segment: { flex: 1, paddingVertical: 6, borderRadius: 7, alignItems: 'center' },
  segmentText: { fontSize: 13, fontWeight: '600' },
  banner: { borderWidth: 1, borderRadius: 8, padding: 10, margin: 16, marginBottom: 0 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15 },
});
