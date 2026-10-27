import { Alert } from 'react-native';

import type { ApiClient } from './api';
import type { Task } from './types';

/** Done <-> To do. Returns the updated task, or null after showing an alert. */
export async function toggleDone(api: ApiClient, task: Task): Promise<Task | null> {
  try {
    return await api.updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
  } catch (e) {
    Alert.alert("Couldn't update task", e instanceof Error ? e.message : String(e));
    return null;
  }
}
