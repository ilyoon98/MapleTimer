import { useEffect, useState } from 'react';
import { desktop, type CaptureSource } from '../platform/desktop';
import { useEscape } from './SettingsModal';
import { closeCapturePicker, connectSelectedSource, connectStore, type CapturePickerSurface } from './connect';

export function CapturePicker({ surface, ownerWindow }: { surface: CapturePickerSurface; ownerWindow?: Window }) {
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [selected, setSelected] = useState('');
  const busy = connectStore.use(s => s.connecting);
  const [error, setError] = useState('');
  const featured = sources.find(s => s.recommended);
  const ordered = featured ? [featured, ...sources.filter(s => s.id !== featured.id)] : sources;
  const onClose = () => closeCapturePicker(surface);
  useEscape(() => { if (!busy) onClose(); }, ownerWindow);
  const load = async () => {
    setError('');
    try {
      const rows = await desktop!.listSources();
      setSources(rows);
      setSelected(rows.find(s => s.recommended)?.id ?? '');
    } catch { setError('창 목록을 불러오지 못했어요. 다시 시도해 주세요.'); }
  };
  useEffect(() => { void load(); }, []);
  return <div className={`modal-backdrop${surface === 'pip' ? ' pip-capture-picker' : ''}`}><section className="modal" role="dialog" aria-modal="true" aria-label="메이플 연결">
    <header className="modal-head"><h2>메이플 연결</h2><button onClick={onClose} disabled={busy}>닫기</button></header>
    <div className="modal-body">
      {!sources.some(s => s.recommended) && <p>메이플을 켜거나 공유할 화면을 선택해 주세요.</p>}
      <div className="capture-sources">{ordered.map(s => <button key={s.id}
        className={[selected === s.id ? 'capture-selected' : '', s.id === featured?.id ? 'capture-featured' : ''].filter(Boolean).join(' ')}
        onClick={() => setSelected(s.id)} disabled={busy} aria-pressed={selected === s.id}>
        <img src={s.thumbnail} alt="" /><span>{s.recommended ? '추천 · ' : ''}{s.name}</span>
      </button>)}</div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="field-row"><button onClick={load} disabled={busy}>새로고침</button>
        <button className="primary" disabled={!selected || busy} onClick={async () => {
          setError('');
          try { await connectSelectedSource(selected, surface); }
          catch (e) { setError((e as Error).message || '연결하지 못했어요. 다시 선택해 주세요.'); }
        }}>{busy ? '연결 중…' : '연결'}</button></div>
    </div></section></div>;
}
