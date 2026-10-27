import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ErrorBanner, HeaderButton, Segmented } from '../../components/ui';
import { fromISODate, toISODate } from '../../lib/parse';
import { useApi } from '../../lib/settings';
import { useColors } from '../../lib/theme';
import { PRIORITIES, STATUS_LABELS, STATUSES, type Task, type TaskInput } from '../../lib/types';

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const c = useColors();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [draft, setDraft] = useState<TaskInput>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .task(Number(id))
      .then((t) => {
        setTask(t);
        setDraft({
          title: t.title,
          notes: t.notes,
          status: t.status,
          priority: t.priority,
          due_date: t.due_date,
          list_id: t.list_id,
        });
      })
      .catch((e) => setError(e.message));
  }, [api, id]);

  const set = (patch: TaskInput) => setDraft((d) => ({ ...d, ...patch }));
  const [listLabel, setListLabel] = useState('');
  useEffect(() => {
    if (task) setListLabel(`${task.workspace_name} › ${task.list_name}`);
  }, [task]);

  async function save() {
    if (!draft.title?.trim()) {
      Alert.alert('A task needs a title');
      return;
    }
    setSaving(true);
    try {
      await api.updateTask(Number(id), { ...draft, title: draft.title.trim() });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function remove() {
    Alert.alert('Delete this task?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteTask(Number(id));
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }

  async function chooseList() {
    try {
      const workspaces = await api.workspaces();
      const lists = (await Promise.all(workspaces.map((w) => api.lists(w.id)))).flatMap((ls, i) =>
        ls.map((l) => ({ id: l.id, label: `${workspaces[i].name} › ${l.name}` })),
      );
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Move to list', options: [...lists.map((l) => l.label), 'Cancel'], cancelButtonIndex: lists.length },
        (i) => {
          if (i < lists.length) {
            set({ list_id: lists[i].id });
            setListLabel(lists[i].label);
          }
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const header = (
    <Stack.Screen
      options={{
        headerLeft: () => <HeaderButton title="Cancel" onPress={() => router.back()} />,
        headerRight: () =>
          saving ? <ActivityIndicator /> : <HeaderButton title="Save" bold onPress={save} />,
      }}
    />
  );

  if (!task) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {header}
        {error ? <ErrorBanner message={error} /> : <ActivityIndicator style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const field = [styles.field, { backgroundColor: c.panel, borderColor: c.line, color: c.text }];
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      {header}
      <ErrorBanner message={error} />

      <TextInput
        value={draft.title}
        onChangeText={(title) => set({ title })}
        placeholder="Title"
        placeholderTextColor={c.muted}
        style={[field, styles.title]}
      />
      <TextInput
        value={draft.notes}
        onChangeText={(notes) => set({ notes })}
        placeholder="Notes"
        placeholderTextColor={c.muted}
        multiline
        style={[field, styles.notes]}
      />

      <Label text="Status" />
      <Segmented
        value={draft.status!}
        onChange={(status) => set({ status })}
        options={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
      />

      <Label text="Priority" />
      <Segmented
        value={draft.priority!}
        onChange={(priority) => set({ priority })}
        options={PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))}
      />

      <View style={[styles.rowField, { backgroundColor: c.panel, borderColor: c.line }]}>
        <Text style={[styles.rowLabel, { color: c.text }]}>Due date</Text>
        {draft.due_date && (
          <DateTimePicker
            value={fromISODate(draft.due_date)}
            mode="date"
            display="compact"
            onChange={(_, d) => d && set({ due_date: toISODate(d) })}
          />
        )}
        <Switch
          value={!!draft.due_date}
          onValueChange={(on) => set({ due_date: on ? toISODate(new Date()) : null })}
        />
      </View>

      <Pressable onPress={chooseList} style={[styles.rowField, { backgroundColor: c.panel, borderColor: c.line }]}>
        <Text style={[styles.rowLabel, { color: c.text }]}>List</Text>
        <Text style={{ color: c.muted, fontSize: 16, flexShrink: 1 }} numberOfLines={1}>
          {listLabel} ›
        </Text>
      </Pressable>

      <Pressable onPress={remove} style={styles.delete}>
        <Text style={{ color: c.danger, fontSize: 17 }}>Delete task</Text>
      </Pressable>
    </ScrollView>
  );
}

function Label({ text }: { text: string }) {
  const c = useColors();
  return <Text style={[styles.label, { color: c.muted }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  form: { padding: 16, gap: 10, paddingBottom: 60 },
  field: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  title: { fontSize: 18, fontWeight: '600' },
  notes: { minHeight: 100, textAlignVertical: 'top' },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  rowField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 48,
    marginTop: 8,
  },
  rowLabel: { flex: 1, fontSize: 16 },
  delete: { alignItems: 'center', paddingVertical: 14, marginTop: 20 },
});
