import { useIssues } from "./issues";

/** 손볼 것이 있을 때만 한 문장 + 해결 버튼으로 보여 준다. 다 괜찮으면 아무것도 없다 */
export function SetupChecklist() {
  const issues = useIssues();
  if (!issues.length) return null;
  return (
    <section className="notice" aria-live="polite">
      {issues.map((it) => (
        <div key={it.key} className="notice-row">
          <span className="notice-mark" aria-hidden>!</span>
          <span className="notice-text">{it.text}</span>
          {it.action && (
            <button className="primary" onClick={it.action.run}>
              {it.action.label}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
