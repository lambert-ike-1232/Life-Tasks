import type { QuickAdd, QuickAddResult, Status, Task, TaskInput, TaskList, Workspace } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Thin typed wrapper over the Life Tasks REST API (see the backend README). */
export class ApiClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api${path}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(`Can't reach ${this.baseUrl}. Check the server address in Settings.`, 0);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      } catch {}
      if (res.status === 401) detail = 'Wrong or missing API key. Check Settings.';
      throw new ApiError(detail || `HTTP ${res.status}`, res.status);
    }
    return (res.status === 204 ? null : await res.json()) as T;
  }

  workspaces() {
    return this.request<Workspace[]>('/workspaces');
  }

  lists(workspaceId: number) {
    return this.request<TaskList[]>(`/workspaces/${workspaceId}/lists`);
  }

  createList(workspaceId: number, name: string) {
    return this.request<TaskList>(`/workspaces/${workspaceId}/lists`, { method: 'POST', body: { name } });
  }

  renameList(listId: number, name: string) {
    return this.request<TaskList>(`/lists/${listId}`, { method: 'PATCH', body: { name } });
  }

  deleteList(listId: number) {
    return this.request<null>(`/lists/${listId}`, { method: 'DELETE' });
  }

  tasks(params: { list_id?: number; status?: Status; due_before?: string; include_done?: boolean; q?: string }) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    return this.request<Task[]>(`/tasks${qs ? `?${qs}` : ''}`);
  }

  task(id: number) {
    return this.request<Task>(`/tasks/${id}`);
  }

  createTask(listId: number, body: TaskInput & { title: string }) {
    return this.request<Task>(`/lists/${listId}/tasks`, { method: 'POST', body });
  }

  updateTask(id: number, body: TaskInput) {
    return this.request<Task>(`/tasks/${id}`, { method: 'PATCH', body });
  }

  deleteTask(id: number) {
    return this.request<null>(`/tasks/${id}`, { method: 'DELETE' });
  }

  quickAdd(body: QuickAdd) {
    return this.request<QuickAddResult>('/quick-add', { method: 'POST', body });
  }
}
