const state = { workspaces: [], lists: {}, current: null, tasks: [], editing: null };
const $ = (s) => document.querySelector(s);

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  const key = localStorage.getItem("apiKey");
  if (key) headers["X-API-Key"] = key;
  const res = await fetch("/api" + path, { ...opts, headers, body: opts.body && JSON.stringify(opts.body) });
  if (res.status === 401) {
    const k = prompt("API key");
    if (k) { localStorage.setItem("apiKey", k); return api(path, opts); }
  }
  if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
  return res.status === 204 ? null : res.json();
}

async function loadSidebar() {
  state.workspaces = await api("/workspaces");
  await Promise.all(state.workspaces.map(async (w) => { state.lists[w.id] = await api(`/workspaces/${w.id}/lists`); }));
  const nav = $("#workspaces");
  nav.innerHTML = "";
  for (const w of state.workspaces) {
    const div = document.createElement("div");
    div.className = "ws";
    div.innerHTML = `<div class="ws-name"><span class="dot" style="background:${w.color}"></span><span></span>
      <button class="ghost" title="New list">+</button></div>`;
    div.querySelector(".ws-name span:nth-child(2)").textContent = w.name;
    div.querySelector("button").onclick = () => newList(w);
    for (const l of state.lists[w.id]) {
      const a = document.createElement("div");
      a.className = "list-link" + (state.current?.id === l.id ? " active" : "");
      a.innerHTML = `<span></span><span class="count">${l.open_tasks || ""}</span>`;
      a.firstChild.textContent = l.name;
      a.onclick = () => { selectList(l.id); document.body.classList.remove("menu-open"); };
      div.appendChild(a);
    }
    nav.appendChild(div);
  }
}

function findList(id) {
  for (const w of state.workspaces) {
    const l = state.lists[w.id].find((x) => x.id === id);
    if (l) return { list: l, ws: w };
  }
}

async function selectList(id) {
  const found = findList(id);
  if (!found) return;
  state.current = found.list;
  localStorage.setItem("currentList", id);
  $("#crumb").textContent = found.ws.name;
  $("#title").textContent = found.list.name;
  $("#rename-list").hidden = $("#delete-list").hidden = false;
  document.querySelectorAll(".list-link").forEach((el) => el.classList.toggle("active", el.firstChild.textContent === found.list.name && el.parentElement.querySelector(".ws-name span:nth-child(2)").textContent === found.ws.name));
  await loadTasks();
}

async function loadTasks() {
  state.tasks = await api(`/tasks?list_id=${state.current.id}`);
  renderBoard();
}

function renderBoard() {
  const today = new Date().toISOString().slice(0, 10);
  for (const col of document.querySelectorAll(".column")) {
    const tasks = state.tasks.filter((t) => t.status === col.dataset.status);
    col.querySelector("h3 span").textContent = tasks.length || "";
    const box = col.querySelector(".cards");
    box.innerHTML = "";
    for (const t of tasks) {
      const card = document.createElement("div");
      card.className = `card ${t.priority}`;
      card.draggable = true;
      card.innerHTML = `<div class="t"></div><div class="meta"></div>`;
      card.querySelector(".t").textContent = t.title;
      const meta = card.querySelector(".meta");
      if (t.due_date) {
        const s = document.createElement("span");
        s.textContent = "Due " + t.due_date;
        if (t.status !== "done" && t.due_date < today) s.className = "overdue";
        meta.appendChild(s);
      }
      if (t.notes) meta.append("📝");
      card.ondragstart = (e) => { e.dataTransfer.setData("text/plain", t.id); card.classList.add("dragging"); };
      card.ondragend = () => card.classList.remove("dragging");
      card.onclick = () => openEditor(t);
      box.appendChild(card);
    }
  }
}

for (const col of document.querySelectorAll(".column")) {
  col.ondragover = (e) => { e.preventDefault(); col.classList.add("over"); };
  col.ondragleave = () => col.classList.remove("over");
  col.ondrop = async (e) => {
    e.preventDefault();
    col.classList.remove("over");
    const id = Number(e.dataTransfer.getData("text/plain"));
    await api(`/tasks/${id}`, { method: "PATCH", body: { status: col.dataset.status } });
    await Promise.all([loadTasks(), loadSidebar()]);
  };
}

$("#add-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!state.current) return;
  const body = { title: $("#add-title").value.trim(), priority: $("#add-priority").value };
  if ($("#add-due").value) body.due_date = $("#add-due").value;
  await api(`/lists/${state.current.id}/tasks`, { method: "POST", body });
  $("#add-title").value = "";
  $("#add-due").value = "";
  await Promise.all([loadTasks(), loadSidebar()]);
};

function openEditor(t) {
  state.editing = t;
  $("#edit-title").value = t.title;
  $("#edit-notes").value = t.notes;
  $("#edit-status").value = t.status;
  $("#edit-priority").value = t.priority;
  $("#edit-due").value = t.due_date || "";
  const sel = $("#edit-list");
  sel.innerHTML = "";
  for (const w of state.workspaces) {
    const g = document.createElement("optgroup");
    g.label = w.name;
    for (const l of state.lists[w.id]) g.appendChild(new Option(l.name, l.id, false, l.id === t.list_id));
    sel.appendChild(g);
  }
  $("#editor").showModal();
}

$("#editor").onclose = async () => {
  if ($("#editor").returnValue !== "save" || !state.editing) return;
  await api(`/tasks/${state.editing.id}`, {
    method: "PATCH",
    body: {
      title: $("#edit-title").value.trim(),
      notes: $("#edit-notes").value,
      status: $("#edit-status").value,
      priority: $("#edit-priority").value,
      due_date: $("#edit-due").value || null,
      list_id: Number($("#edit-list").value),
    },
  });
  await Promise.all([loadTasks(), loadSidebar()]);
};

$("#edit-delete").onclick = async () => {
  if (!confirm("Delete this task?")) return;
  await api(`/tasks/${state.editing.id}`, { method: "DELETE" });
  $("#editor").close("deleted");
  await Promise.all([loadTasks(), loadSidebar()]);
};

async function newList(w) {
  const name = prompt(`New list in ${w.name}`);
  if (!name) return;
  const l = await api(`/workspaces/${w.id}/lists`, { method: "POST", body: { name } });
  await loadSidebar();
  selectList(l.id);
}

$("#new-workspace").onclick = async () => {
  const name = prompt("Workspace name");
  if (!name) return;
  try {
    const w = await api("/workspaces", { method: "POST", body: { name } });
    await api(`/workspaces/${w.id}/lists`, { method: "POST", body: { name: "To Do" } });
    await loadSidebar();
  } catch (err) { alert(err.message); }
};

$("#rename-list").onclick = async () => {
  const name = prompt("Rename list", state.current.name);
  if (!name) return;
  await api(`/lists/${state.current.id}`, { method: "PATCH", body: { name } });
  await loadSidebar();
  selectList(state.current.id);
};

$("#delete-list").onclick = async () => {
  if (!confirm(`Delete "${state.current.name}" and all its tasks?`)) return;
  await api(`/lists/${state.current.id}`, { method: "DELETE" });
  state.current = null;
  await loadSidebar();
  const first = state.workspaces.flatMap((w) => state.lists[w.id])[0];
  if (first) selectList(first.id);
};

$("#menu").onclick = () => document.body.classList.toggle("menu-open");

(async () => {
  await loadSidebar();
  const saved = Number(localStorage.getItem("currentList"));
  const first = state.workspaces.flatMap((w) => state.lists[w.id])[0];
  selectList(findList(saved) ? saved : first?.id);
})();
