import { useRef, type ReactNode } from "react";
import { BuffbarSteps, MockScreen } from "./guideArt";
import { useEscape } from "./SettingsModal";

const SECTIONS: Array<{ id: string; title: string; body: ReactNode }> = [
  {
    id: "start",
    title: "시작하기",
    body: (
      <>
        <ol className="art-steps">
          <li>
            <b>메이플 연결</b> — 오른쪽 위 버튼을 누르고 메이플스토리 창을 골라요
          </li>
          <li>
            <b>쓸 알림 켜기</b> — 칸마다 켜기만 하면 돼요. 위치는 대부분 자동으로 찾아요
          </li>
          <li>
            <b>PIP 타이머</b> — 게임 위에 작은 창을 띄워 두면 다른 창을 봐도 계속 알려요
          </li>
        </ol>
        <MockScreen />
        <p>손볼 게 있으면 그 칸에 <b>노란 줄</b>로 알려 줘요. 게임 창은 최소화하지 마세요.</p>
      </>
    ),
  },
  {
    id: "game",
    title: "게임 안 설정",
    body: (
      <>
        <p>게임의 설정 &gt; UI 에서 한 번만 맞춰 두세요.</p>
        <ul className="guide-list">
          <li>
            UI 크기: <b>최적 비율</b>
          </li>
          <li>
            퀵슬롯&amp;버프 시간표시: <b>중앙, 크게</b> · <b>분 + 초</b>
          </li>
          <li>
            버프 정렬 옵션: <b>모두 켜기</b>
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "features",
    title: "기능",
    body: (
      <ul className="guide-list">
        <li>
          <b>스킬 알림</b> — 솔 야누스·에르다 파운틴 남은 시간을 읽어요. 즐겨찾기로 옮겼다면 칸의 설정에서 '버프 즐겨찾기'
        </li>
        <li>
          <b>룬 알림</b> — 미니맵에 룬이 뜨면 알려요
        </li>
        <li>
          <b>사냥 멈춤</b> — 경험치가 한동안 안 오르면 알려요
        </li>
        <li>
          <b>버프 종료</b> — 등록한 버프 아이콘이 끝나기 전에 알려요 (칸의 '설정 방법' 참고)
        </li>
        <li>
          <b>부스터</b> — 켜기만 하면 남은 시간을 읽어요
        </li>
        <li>
          <b>일반 타이머</b> — 재획 비약처럼 화면에 없는 시간을 재요
        </li>
        <li>
          <b>PIP</b> — 오른쪽 위 ⚙ 에서 글자 크기·알림 모양을 바꿔요. 창 크기는 끌어서
        </li>
      </ul>
    ),
  },
  {
    id: "buffs",
    title: "버프 등록 방법",
    body: <BuffbarSteps />,
  },
  {
    id: "trouble",
    title: "잘 안 될 때",
    body: (
      <ul className="guide-list">
        <li>노란 줄 안내가 있으면 그 버튼부터 눌러 보세요</li>
        <li>
          화면이 검게 나오면 '다른 창 선택'에서 <b>모니터 전체</b>를 골라요
        </li>
        <li>소리가 안 나면 볼륨 옆 🔇 와 PC 볼륨을 확인해요</li>
        <li>
          그래도 이상하면 바로 <b>설정 &gt; 문제가 생겼을 때 &gt; 진단 파일 저장</b>
        </li>
      </ul>
    ),
  },
];

export function GuideModal({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-guide">
        <header className="modal-head">
          <h3>사용 가이드</h3>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <div className="guide-layout">
          <nav className="guide-nav" aria-label="가이드 목차">
            {SECTIONS.map((s) => (
              <button key={s.id} onClick={() => refs.current[s.id]?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                {s.title}
              </button>
            ))}
          </nav>
          <div>
            {SECTIONS.map((s) => (
              <section key={s.id} className="guide-sec" ref={(el) => void (refs.current[s.id] = el)}>
                <h4>{s.title}</h4>
                {s.body}
              </section>
            ))}
            <p className="muted small">비공식 개인용 도구예요. 사용에 따른 책임은 본인에게 있어요.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
