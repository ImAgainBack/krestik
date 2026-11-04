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
    request.onerror = () => reject(request.error);
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

export async function saveProject(project) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECTS, "readwrite");
    transaction.objectStore(PROJECTS).put(project);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function deleteProject(id) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECTS, "readwrite");
    transaction.objectStore(PROJECTS).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
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
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SETTINGS, "readwrite");
    transaction.objectStore(SETTINGS).put(value, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}
