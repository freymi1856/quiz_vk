import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../data');
const dataFile = path.join(dataDir, 'store.json');

const initialData = {
  users: [],
  quizzes: [],
  sessions: []
};

let cache = null;
let writeQueue = Promise.resolve();

async function ensureStore() {
  await mkdir(dataDir, { recursive: true });

  try {
    const raw = await readFile(dataFile, 'utf8');
    cache = JSON.parse(raw);
  } catch {
    cache = structuredClone(initialData);
    await persist();
  }
}

async function persist() {
  writeQueue = writeQueue.then(() =>
    writeFile(dataFile, JSON.stringify(cache, null, 2), 'utf8')
  );
  await writeQueue;
}

export async function initDb() {
  if (!cache) {
    await ensureStore();
  }
}

export function now() {
  return new Date().toISOString();
}

export function createId() {
  return randomUUID();
}

export function getData() {
  return cache;
}

export async function saveData() {
  await persist();
}

export async function mutate(mutator) {
  const result = await mutator(cache);
  await persist();
  return result;
}
