"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const STATUSES = ["Wishlist", "Applied", "Interview", "Offer", "Rejected"];

function clean(value, limit = 500) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, limit)
    : "";
}

function normalize(input, current = {}) {
  const item = {
    ...current,
    company: clean(input.company ?? current.company, 100),
    role: clean(input.role ?? current.role, 120),
    status: clean(input.status ?? current.status, 30),
    location: clean(input.location ?? current.location, 100),
    workType: clean(input.workType ?? current.workType, 30),
    salary: clean(input.salary ?? current.salary, 80),
    source: clean(input.source ?? current.source, 80),
    link: clean(input.link ?? current.link, 500),
    appliedDate: clean(input.appliedDate ?? current.appliedDate, 20),
    nextStep: clean(input.nextStep ?? current.nextStep, 160),
    notes: clean(input.notes ?? current.notes, 1500)
  };
  const details = {};

  for (const field of ["company", "role", "status"]) {
    if (!item[field]) details[field] = "This field is required.";
  }
  if (!STATUSES.includes(item.status)) details.status = "Choose a valid status.";
  if (item.link) {
    try {
      const url = new URL(item.link);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      details.link = "Enter a valid HTTP or HTTPS URL.";
    }
  }
  if (item.appliedDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.appliedDate)) {
    details.appliedDate = "Enter a valid date.";
  }
  if (Object.keys(details).length) {
    const error = new Error("Validation failed.");
    error.statusCode = 422;
    error.details = details;
    throw error;
  }
  return item;
}

class ApplicationStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
  }

  async read() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      return JSON.parse(await fs.readFile(this.filePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.writeFile(this.filePath, "[]\n");
      return [];
    }
  }

  async write(items) {
    this.queue = this.queue.then(async () => {
      const temporary = this.filePath + ".tmp";
      await fs.writeFile(temporary, JSON.stringify(items, null, 2) + "\n");
      await fs.rename(temporary, this.filePath);
    });
    return this.queue;
  }

  async list({ query = "", status = "All", sort = "updated" } = {}) {
    const needle = query.trim().toLowerCase();
    const items = (await this.read()).filter((item) => {
      const text = [item.company, item.role, item.location, item.source]
        .join(" ")
        .toLowerCase();
      return (status === "All" || item.status === status) && (!needle || text.includes(needle));
    });
    const sorters = {
      company: (a, b) => a.company.localeCompare(b.company),
      applied: (a, b) => (b.appliedDate || "").localeCompare(a.appliedDate || ""),
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt)
    };
    return items.sort(sorters[sort] || sorters.updated);
  }

  async create(input) {
    const items = await this.read();
    const now = new Date().toISOString();
    const item = { id: crypto.randomUUID(), ...normalize(input), createdAt: now, updatedAt: now };
    items.push(item);
    await this.write(items);
    return item;
  }

  async update(id, input) {
    const items = await this.read();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return this.notFound();
    items[index] = {
      ...normalize(input, items[index]),
      id,
      createdAt: items[index].createdAt,
      updatedAt: new Date().toISOString()
    };
    await this.write(items);
    return items[index];
  }

  async remove(id) {
    const items = await this.read();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return this.notFound();
    const removed = items.splice(index, 1)[0];
    await this.write(items);
    return removed;
  }

  notFound() {
    const error = new Error("Application not found.");
    error.statusCode = 404;
    throw error;
  }

  async stats() {
    const items = await this.read();
    const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    items.forEach((item) => {
      if (item.status in byStatus) byStatus[item.status] += 1;
    });
    const submitted = items.length - byStatus.Wishlist;
    const responses = byStatus.Interview + byStatus.Offer + byStatus.Rejected;
    return {
      total: items.length,
      active: byStatus.Applied + byStatus.Interview,
      interviews: byStatus.Interview,
      offers: byStatus.Offer,
      responseRate: submitted ? Math.round((responses / submitted) * 100) : 0,
      byStatus
    };
  }
}

module.exports = { ApplicationStore, STATUSES, normalize };
