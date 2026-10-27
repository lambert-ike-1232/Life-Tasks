import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddBar } from '../../components/AddBar';
import { TaskRow } from '../../components/TaskRow';
import { Empty, ErrorBanner, HeaderButton, Segmented } from '../../components/ui';
import { parseQuickAdd } from '../../lib/parse';
import { useApi } from '../../lib/settings';
import { toggleDone } from '../../lib/tasks';
import { useColors } from '../../lib/theme';
import { STATUS_LABELS, STATUSES, type Status, type Task } from '../../lib/types';
import { useLoader } from '../../lib/useLoader';

export default function ListScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const listId = Number(params.id);
  const api = useApi();
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(params.name ?? '');
  const [filter, setFilter] = useState<Status>('todo');

  const tasks = useLoader(() => api.tasks({ list_id: listId }));
  const all = tasks.data ?? [];
  const shown = all.filter((t) => t.status === filter);

  async function add(text: string) {
    const { list: _list, workspace: _ws, ...fields } = parseQuickAdd(text);
    if (!fields.title) return;
    try {
      const task = await api.createTask(listId, { ...fields, status: filter === 'done' ? 'todo' : filter });
      tasks.setData((ts) => [...(ts ?? []), task]);
      if (filter === 'done') setFilter('todo');
    } catch (e) {
      Alert.alert("Couldn't add task", e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  async function toggle(task: Task) {
    const updated = await toggleDone(api, task);
    if (updated) tasks.setData((ts) => ts?.map((t) => (t.id === updated.id ? updated : t)) ?? null);
  }

  function rename() {
    Alert.prompt(
      'Rename list',
      undefined,
      async (newName) => {
        if (!newName?.trim()) return;
        try {
          const updated = await api.renameList(listId, newName.trim());
          setName(updated.name);
        } catch (e) {
          Alert.alert("Couldn't rename list", e instanceof Error ? e.message : String(e));
        }
      },
      'plain-text',
      name,
    );
  }

  function remove() {
    Alert.alert(`Delete "${name}"?`, `Its ${all.length} task(s) will be deleted too.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteList(listId);
            router.back();
          } catch (e) {
            Alert.alert("Couldn't delete list", e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }

  function menu() {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Rename list', 'Delete list', 'Cancel'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
      (i) => (i === 0 ? rename() : i === 1 ? remove() : undefined),
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="padding" keyboardVerticalOffset={100}>
      <Stack.Screen options={{ title: name, headerRight: () => <HeaderButton title="Edit" onPress={menu} /> }} />
      <View style={styles.filter}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={STATUSES.map((s) => {
            const n = all.filter((t) => t.status === s).length;
            return { value: s, label: n ? `${STATUS_LABELS[s]} ${n}` : STATUS_LABELS[s] };
          })}
        />
      </View>
      <ErrorBanner message={tasks.error} />
      <FlatList
        data={shown}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => <TaskRow task={item} onToggle={toggle} />}
        refreshControl={<RefreshControl refreshing={tasks.refreshing} onRefresh={tasks.refresh} />}
        ListEmptyComponent={tasks.data ? <Empty text={`Nothing ${STATUS_LABELS[filter].toLowerCase()}.`} /> : undefined}
        keyboardShouldPersistTaps="handled"
      />
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12), borderColor: c.line }]}>
        <AddBar placeholder="New task…  !high ^tomorrow" onSubmit={add} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  filter: { paddingHorizontal: 16, paddingVertical: 10 },
  bottom: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
