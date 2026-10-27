// Mirrors app/schemas.py in the backend.

export type Status = 'todo' | 'in_progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';

export interface Workspace {
  id: number;
  name: string;
  slug: string;
  color: string;
}

export interface TaskList {
  id: number;
  workspace_id: number;
  name: string;
  slug: string;
  open_tasks: number;
}

export interface Task {
  id: number;
  list_id: number;
  list_name: string;
  workspace_id: number;
  workspace_name: string;
  title: string;
  notes: string;
  status: Status;
  priority: Priority;
  due_date: string | null; // YYYY-MM-DD
  position: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TaskInput {
  title?: string;
  notes?: string;
  status?: Status;
  priority?: Priority;
  due_date?: string | null;
  list_id?: number;
}

export interface QuickAdd {
  title: string;
  list?: string;
  workspace?: string;
  priority?: Priority;
  due_date?: string;
}

export interface QuickAddResult {
  task: Task;
  created_list: boolean;
  message: string;
}

export const STATUS_LABELS: Record<Status, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

export const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
export const STATUSES: Status[] = ['todo', 'in_progress', 'done'];
