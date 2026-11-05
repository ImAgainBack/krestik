// Existing signatures retained. Added atomic importProjects and save-status subscription.
const listeners = new Set();
export function onSaveStatus(callback) { listeners.add(callback); return () => listeners.delete(callback); }
export function reportSaveStatus(status) { for (const callback of listeners) { try { callback(status); } catch {} } }
const DATABASE = "point-atelier";
const VERSION = 2;
const PROJECTS = "projects";
const SETTINGS = "settings";
let databasePromise;

function database() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS))
        db.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SETTINGS))
        db.createObjectStore(SETTINGS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { databasePromise = null; reject(request.error); };
  });
  return databasePromise;
}

export async function allProjects() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(PROJECTS).objectStore(PROJECTS).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(stores, operation) {
  reportSaveStatus('saving');
  try {
    const db = await database();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Не удалось сохранить'));
      try { operation(tx); } catch (error) { tx.abort(); reject(error); }
    });
    reportSaveStatus('saved');
  } catch (error) { reportSaveStatus('error'); throw error; }
}
export async function saveProject(project) {
  const stored = {...project};
  if (project.checked && project.pattern) {
    const bits = new Uint8Array(Math.ceil(project.pattern.cells.length / 8));
    for (const index of project.checked) if (Number.isInteger(index) && index >= 0 && index < project.pattern.cells.length && project.pattern.cells[index] !== 65535) bits[index >> 3] |= 1 << (index % 8);
    stored.checkedBits = bits;
  }
  return write(PROJECTS, tx => tx.objectStore(PROJECTS).put(stored));
}

export async function deleteProject(id) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECTS, "readwrite");
    transaction.objectStore(PROJECTS).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Не удалось сохранить"));
  });
}

export async function getSetting(key, fallback) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SETTINGS).objectStore(SETTINGS).get(key);
    request.onsuccess = () => resolve(request.result ?? fallback);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSetting(key, value) {
  return write(SETTINGS, tx => tx.objectStore(SETTINGS).put(value, key));
}

// One transaction: invalid input is rejected by backup.js before this call.
// add() plus key checks inside the transaction prevent overwriting concurrent imports.
export async function importProjects(projects, ownedDmc) {
  return write([PROJECTS, SETTINGS], tx => {
    const store = tx.objectStore(PROJECTS);
    const request = store.getAllKeys();
    request.onsuccess = () => {
      try {
        const ids = new Set(request.result);
        for (const project of projects) {
          let id = project.id;
          while (ids.has(id)) id = crypto.randomUUID();
          ids.add(id); store.add({...project, id});
        }
        const settings = tx.objectStore(SETTINGS);
        const previous = settings.get('ownedDmc');
        previous.onsuccess = () => settings.put([...new Set([...(previous.result || []), ...ownedDmc])], 'ownedDmc');
      } catch { tx.abort(); }
    };
  });
}
