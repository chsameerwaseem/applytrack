"use strict";

const state = { items: [] };
const list = document.querySelector("[data-list]");
const empty = document.querySelector("[data-empty]");
const dialog = document.querySelector("[data-dialog]");
const form = document.querySelector("[data-form]");
const search = document.querySelector("[data-search]");
const statusFilter = document.querySelector("[data-status]");
const sort = document.querySelector("[data-sort]");
const toast = document.querySelector("[data-toast]");

document.querySelector("[data-today]").textContent = new Intl.DateTimeFormat("en", {
  month: "short", day: "numeric", year: "numeric"
}).format(new Date());

async function api(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options && options.headers) }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Something went wrong.");
  }
  return response.status === 204 ? null : response.json();
}

function escapeText(value) {
  const element = document.createElement("span");
  element.textContent = value || "";
  return element.innerHTML;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function card(item) {
  const date = item.appliedDate
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(item.appliedDate + "T00:00:00"))
    : "Not applied";
  const safeLink = item.link ? escapeText(item.link) : "";
  return '<article class="application-card">' +
    '<div class="company-mark">' + escapeText(item.company.slice(0, 2).toUpperCase()) + '</div>' +
    '<div class="application-main"><div class="application-title"><div><h3>' + escapeText(item.role) + '</h3><p>' + escapeText(item.company) + '</p></div>' +
    '<span class="status status-' + item.status.toLowerCase() + '">' + escapeText(item.status) + '</span></div>' +
    '<dl><div><dt>Location</dt><dd>' + escapeText(item.location || "Not specified") + '</dd></div><div><dt>Applied</dt><dd>' + date + '</dd></div><div><dt>Next step</dt><dd>' + escapeText(item.nextStep || "None added") + '</dd></div></dl>' +
    '<div class="card-actions">' + (safeLink ? '<a href="' + safeLink + '" target="_blank" rel="noreferrer">View role ↗</a>' : '') +
    '<button type="button" data-edit="' + item.id + '">Edit</button><button class="danger" type="button" data-delete="' + item.id + '">Delete</button></div></div></article>';
}

async function load() {
  const params = new URLSearchParams({ q: search.value, status: statusFilter.value, sort: sort.value });
  const [applications, stats] = await Promise.all([
    api("/api/applications?" + params),
    api("/api/stats")
  ]);
  state.items = applications.data;
  list.innerHTML = state.items.map(card).join("");
  empty.hidden = state.items.length > 0;
  document.querySelector("[data-count]").textContent = state.items.length;
  Object.entries(stats.data).forEach(([key, value]) => {
    const target = document.querySelector('[data-stat="' + key + '"]');
    if (target && typeof value !== "object") target.textContent = value;
  });
}

function openForm(item) {
  form.reset();
  form.elements.id.value = item ? item.id : "";
  document.querySelector("[data-dialog-title]").textContent = item ? "Edit application" : "Add application";
  document.querySelector("[data-form-error]").textContent = "";
  if (item) Object.keys(item).forEach((key) => {
    if (form.elements[key]) form.elements[key].value = item[key] || "";
  });
  dialog.showModal();
  setTimeout(() => form.elements.company.focus(), 0);
}

document.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => openForm()));
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form));
  const id = payload.id;
  delete payload.id;
  try {
    await api(id ? "/api/applications/" + id : "/api/applications", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });
    dialog.close();
    showToast(id ? "Application updated." : "Application added.");
    await load();
  } catch (error) {
    document.querySelector("[data-form-error]").textContent = error.message;
  }
});

list.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit]");
  const remove = event.target.closest("[data-delete]");
  if (edit) openForm(state.items.find((item) => item.id === edit.dataset.edit));
  if (remove && confirm("Delete this application? This cannot be undone.")) {
    await api("/api/applications/" + remove.dataset.delete, { method: "DELETE" });
    showToast("Application deleted.");
    await load();
  }
});

let debounce;
search.addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(load, 200);
});
statusFilter.addEventListener("change", load);
sort.addEventListener("change", load);

load().catch((error) => {
  list.innerHTML = '<p class="load-error">' + escapeText(error.message) + '</p>';
});
