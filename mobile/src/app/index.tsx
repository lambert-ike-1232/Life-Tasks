import { Redirect, Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';

import { AddBar } from '../components/AddBar';
import { TaskRow } from '../components/TaskRow';
import { Empty, ErrorBanner, HeaderButton, Segmented } from '../components/ui';
import type { ApiClient } from '../lib/api';
import { addDays, parseQuickAdd, toISODate } from '../lib/parse';
import { useSettings } from '../lib/settings';
import { useColors } from '../lib/theme';
import { toggleDone } from '../lib/tasks';
import type { Task, TaskList, Workspace } from '../lib/types';
import { useLoader } from '../lib/useLoader';

type Mode = 'lists' | 'upcoming';
const UPCOMING_DAYS = 14;

export default function Home() {
  const { loaded, api } = useSettings();
  const router = useRouter();

  if (!loaded) return null;
  if (!api) return <Redirect href="/settings" />;

  return (
    <>
      <Stack.Screen
        options={{ headerRight: () => <HeaderButton title="Settings" onPress={() => router.push('/settings')} /> }}
      />
      <HomeContent api={api} />
    </>
  );
}

function HomeContent({ api }: { api: ApiClient }) {
  const c = useColors();
  const [mode, setMode] = useState<Mode>('lists');
  const [flash, setFlash] = useState<string | null>(null);

  const lists = useLoader(async () => {
    const workspaces = await api.workspaces();
    const lists = await Promise.all(workspaces.map((w) => api.lists(w.id)));
    return workspaces.map((w, i) => ({ workspace: w, data: lists[i] }));
  });

  const upcoming = useLoader(() =>
    api.tasks({ include_done: false, due_before: toISODate(addDays(new Date(), UPCOMING_DAYS)) }),
  );

  const active = mode === 'lists' ? lists : upcoming;

  async function quickAdd(text: string) {
    const parsed = parseQuickAdd(text);
    if (!parsed.title) return;
    try {
      const res = await api.quickAdd(parsed);
      setFlash(res.message);
      setTimeout(() => setFlash(null), 3000);
      lists.reload();
      upcoming.reload();
    } catch (e) {
      Alert.alert("Couldn't add task", e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  async function newList(workspace: Workspace) {
    Alert.prompt(`New list in ${workspace.name}`, undefined, async (name) => {
      if (!name?.trim()) return;
      try {
        await api.createList(workspace.id, name.trim());
        lists.reload();
      } catch (e) {
        Alert.alert("Couldn't create list", e instanceof Error ? e.message : String(e));
      }
    });
  }

  async function toggle(task: Task) {
    const updated = await toggleDone(api, task);
    if (!updated) return;
    upcoming.setData((ts) => ts?.map((t) => (t.id === updated.id ? updated : t)) ?? null);
    lists.reload();
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={styles.top}>
        <AddBar placeholder="Add a task…  #list @workspace !high ^fri" onSubmit={quickAdd} />
        {flash && <Text style={[styles.flash, { color: c.muted }]}>{flash}</Text>}
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'lists', label: 'Lists' },
            { value: 'upcoming', label: 'Upcoming' },
          ]}
        />
      </View>
      <ErrorBanner message={active.error} />

      {mode === 'lists' ? (
        <SectionList
          sections={lists.data ?? []}
          keyExtractor={(l) => String(l.id)}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={<RefreshControl refreshing={lists.refreshing} onRefresh={lists.refresh} />}
          renderSectionHeader={({ section }) => (
            <WorkspaceHeader workspace={section.workspace} onAddList={() => newList(section.workspace)} />
          )}
          renderItem={({ item }) => <ListRow list={item} />}
          ListEmptyComponent={lists.data ? <Empty text="No workspaces yet." /> : undefined}
          stickySectionHeadersEnabled={false}
        />
      ) : (
        <SectionList
          sections={groupByDue(upcoming.data ?? [])}
          keyExtractor={(t) => String(t.id)}
          refreshControl={<RefreshControl refreshing={upcoming.refreshing} onRefresh={upcoming.refresh} />}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.sectionTitle, { color: c.muted }]}>{section.title}</Text>
          )}
          renderItem={({ item }) => <TaskRow task={item} onToggle={toggle} showList />}
          ListEmptyComponent={
            upcoming.data ? <Empty text={`Nothing due in the next ${UPCOMING_DAYS} days.`} /> : undefined
          }
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

function WorkspaceHeader({ workspace, onAddList }: { workspace: Workspace; onAddList: () => void }) {
  const c = useColors();
  return (
    <View style={styles.wsHeader}>
      <View style={[styles.dot, { backgroundColor: workspace.color }]} />
      <Text style={[styles.sectionTitle, styles.wsName, { color: c.muted }]}>{workspace.name}</Text>
      <Pressable onPress={onAddList} hitSlop={10}>
        <Text style={{ color: c.accent, fontSize: 15 }}>+ List</Text>
      </Pressable>
    </View>
  );
}

function ListRow({ list }: { list: TaskList }) {
  const c = useColors();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/list/[id]', params: { id: list.id, name: list.name } })}
      style={({ pressed }) => [styles.listRow, { backgroundColor: pressed ? c.chip : c.panel, borderColor: c.line }]}
    >
      <Text style={[styles.listName, { color: c.text }]}>{list.name}</Text>
      <Text style={{ color: c.muted, fontSize: 15 }}>{list.open_tasks || ''}</Text>
      <Text style={{ color: c.muted, fontSize: 20 }}>›</Text>
    </Pressable>
  );
}

function groupByDue(tasks: Task[]) {
  const today = toISODate(new Date());
  const tomorrow = toISODate(addDays(new Date(), 1));
  const week = toISODate(addDays(new Date(), 7));
  const groups: { title: string; data: Task[] }[] = [
    { title: 'Overdue', data: [] },
    { title: 'Today', data: [] },
    { title: 'Tomorrow', data: [] },
    { title: 'This week', data: [] },
    { title: 'Later', data: [] },
  ];
  const sorted = [...tasks].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
  for (const t of sorted) {
    const d = t.due_date!;
    const i = d < today ? 0 : d === today ? 1 : d === tomorrow ? 2 : d <= week ? 3 : 4;
    groups[i].data.push(t);
  }
  return groups.filter((g) => g.data.length);
}

const styles = StyleSheet.create({
  top: { padding: 16, paddingBottom: 8, gap: 10 },
  flash: { fontSize: 13, marginTop: -4 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
  },
  wsHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 16 },
  wsName: { flex: 1, paddingHorizontal: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 12 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  listName: { flex: 1, fontSize: 17 },
});
