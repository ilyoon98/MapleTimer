import type { PanelId } from "../state/profile";
import { useIssues, type Issue } from "./issues";

function IssueRow({ it }: { it: Issue }) {
  return (
    <div className="notice-row">
      <span className="notice-mark" aria-hidden>
        !
      </span>
      <span className="notice-text">{it.text}</span>
      {it.action && (
        <button className="primary" onClick={it.action.run}>
          {it.action.label}
        </button>
      )}
    </div>
  );
}

/** 맨 위: 연결·화면 문제만. 다 괜찮으면 아무것도 없다 */
export function SetupChecklist() {
  const issues = useIssues().filter((it) => !it.panel);
  if (!issues.length) return null;
  return (
    <section className="notice" aria-live="polite">
      {issues.map((it) => (
        <IssueRow key={it.key} it={it} />
      ))}
    </section>
  );
}

/** 기능 칸 안: 그 칸에서 손볼 것 ('미니맵을 못 찾았어요' 등). 칸을 접어 둬도 보인다 */
export function PanelIssues({ id }: { id: PanelId }) {
  const issues = useIssues().filter((it) => it.panel === id);
  if (!issues.length) return null;
  return (
    <div className="notice notice-panel" aria-live="polite">
      {issues.map((it) => (
        <IssueRow key={it.key} it={it} />
      ))}
    </div>
  );
}
