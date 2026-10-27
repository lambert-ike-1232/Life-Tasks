import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { describeDue } from '../lib/parse';
import { PRIORITY_COLORS, useColors } from '../lib/theme';
import { STATUS_LABELS, type Task } from '../lib/types';

/** One task: tap the circle to complete it, tap the row to edit. */
export function TaskRow({
  task,
  onToggle,
  showList,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  showList?: boolean;
}) {
  const c = useColors();
  const router = useRouter();
  const done = task.status === 'done';
  const due = task.due_date && !done ? describeDue(task.due_date) : null;

  const meta: { text: string; color?: string }[] = [];
  if (showList) meta.push({ text: `${task.workspace_name} › ${task.list_name}` });
  if (task.status === 'in_progress') meta.push({ text: STATUS_LABELS.in_progress, color: c.accent });
  if (due) meta.push({ text: due.label, color: due.overdue ? c.danger : undefined });

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.chip : c.panel, borderColor: c.line }]}
    >
      <Pressable
        onPress={() => onToggle(task)}
        hitSlop={12}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? 'Mark not done' : 'Mark done'}
        style={[
          styles.circle,
          { borderColor: done ? c.accent : PRIORITY_COLORS[task.priority] },
          done && { backgroundColor: c.accent },
        ]}
      >
        {done && <Text style={styles.check}>✓</Text>}
      </Pressable>
      <View style={styles.body}>
        <Text
          style={[styles.title, { color: done ? c.muted : c.text }, done && styles.struck]}
          numberOfLines={2}
        >
          {task.title}
        </Text>
        {meta.length > 0 && (
          <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
            {meta.map((m, i) => (
              <Text key={i} style={m.color ? { color: m.color } : undefined}>
                {i > 0 ? '  ·  ' : ''}
                {m.text}
              </Text>
            ))}
          </Text>
        )}
      </View>
      {task.priority === 'high' && !done && <Text style={[styles.flag, { color: PRIORITY_COLORS.high }]}>!</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  circle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  check: { color: '#fff', fontSize: 14, fontWeight: '700' },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 16 },
  struck: { textDecorationLine: 'line-through' },
  meta: { fontSize: 13 },
  flag: { fontSize: 18, fontWeight: '800' },
});
