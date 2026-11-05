import { useSyncExternalStore } from "react";

export const persistenceStatus = createStore<{errors: Record<string,string>}>({errors:{}});
const report=(key:string,error?:string)=>persistenceStatus.set(s=>{
  if(s.errors[key]===error)return s;
  const errors={...s.errors};if(error)errors[key]=error;else delete errors[key];return {errors};
});

/** localStorage 에 자동 저장되는 아주 작은 전역 상태 저장소 */
export function createPersistentStore<T extends object>(key: string, initial: T, migrate?: (raw: unknown) => T) {
  let state: T = initial;
  const native = typeof window!=="undefined" ? window.mapleDesktop?.settings : undefined;
  let loaded = false;
  const load=(raw:string|null)=>{
    if(!raw)return false;
    const parsed=JSON.parse(raw);state=migrate?migrate(parsed):{...initial,...parsed};return true;
  };
  if(native){try{const saved=native.read(key);loaded=load(saved.value);if(saved.error)report(key,saved.error);}catch{report(key,"앱 설정을 읽지 못했어요");}}
  if(!loaded){try{loaded=load(localStorage.getItem(key));}catch{report(key,"저장된 설정을 읽지 못했어요");}}
  const listeners = new Set<() => void>();
  const save = () => {
    const serialized=JSON.stringify(state);
    let browserOk=false,nativeOk=false,error="설정 저장에 실패했어요. 설정 파일로 내보내 주세요.";
    try{localStorage.setItem(key,serialized);browserOk=true;}catch{}
    if(native){try{const result=native.write(key,serialized);nativeOk=result.ok;if(result.error)error=result.error;}catch{}}
    report(key,(native?!nativeOk:!browserOk)?error:undefined);
  };

  // 예전 localStorage 설정도 첫 실행에 앱 파일로 옮긴다. 읽지 못한 값은 기본값으로 덮지 않는다.
  if(loaded && native)save();

  const store = {
    get: () => state,
    set(update: Partial<T> | ((s: T) => T)) {
      state = typeof update === "function" ? update(state) : { ...state, ...update };
      save();
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    use<S>(selector: (s: T) => S): S {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useSyncExternalStore(store.subscribe, () => selector(state));
    },
  };
  return store;
}

/** 저장하지 않는 런타임 상태용 */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  const store = {
    get: () => state,
    set(update: Partial<T> | ((s: T) => T)) {
      state = typeof update === "function" ? update(state) : { ...state, ...update };
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    use<S>(selector: (s: T) => S): S {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useSyncExternalStore(store.subscribe, () => selector(state));
    },
  };
  return store;
}
