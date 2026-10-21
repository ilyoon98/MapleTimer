// 사용자가 올린 알림음을 IndexedDB 에 보관한다.
const DB_NAME = "maple-timer-personal";
const STORE = "custom-sounds";

export interface CustomSound {
  id: string;
  name: string;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const listCustomSounds = () => tx<CustomSound[]>("readonly", (s) => s.getAll() as IDBRequest<CustomSound[]>);
export const putCustomSound = (s: CustomSound) => tx("readwrite", (st) => st.put(s));
export const deleteCustomSound = (id: string) => tx("readwrite", (st) => st.delete(id));
