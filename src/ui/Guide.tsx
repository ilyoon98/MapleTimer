import { useRef, type ReactNode } from "react";
import { BuffbarSteps, MockScreen } from "./guideArt";
import { useEscape } from "./SettingsModal";

/** 기능마다 '확인할 것 / 주의할 것' 두 칸 */
function Checks({ ok, warn }: { ok: ReactNode[]; warn: ReactNode[] }) {
  return (
    <div className="guide-checks">
      <div className="ok">
        <h5>확인할 것</h5>
        <ul className="guide-list">
          {ok.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
      <div className="warn">
        <h5>주의할 것</h5>
        <ul className="guide-list">
          {warn.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const SECTIONS: Array<{ id: string; title: string; body: ReactNode }> = [
  {
    id: "start",
    title: "시작하기",
    body: (
      <>
        <p>게임 화면을 공유하면 이 브라우저 안에서 화면을 보고 때맞춰 소리로 알려 줘요. 게임 입력·메모리·파일에는 손대지 않아요.</p>
        <ol className="art-steps">
          <li>
            <b>게임 설정 맞추기</b> — 아래 '게임 안 설정'대로 한 번만 맞춰 두세요.
          </li>
          <li>
            <b>화면 공유 시작</b> → 메이플스토리 창 선택. (<code>start.bat</code> 으로 연 전용 창이면 자동으로 골라져요)
          </li>
          <li>
            <b>쓸 기능 켜기</b> — 스킬은 버프 위치, 경험치는 높이만 맞추세요. 부스터는 자동으로 찾아요.
          </li>
          <li>
            <b>알림 맞추기</b> — 각 줄의 설정에서 알림 시점·반복과 알림음·볼륨을 바꿀 수 있어요.
          </li>
        </ol>
        <MockScreen />
        <p>
          다른 탭을 함께 쓴다면 <b>PIP 타이머</b>를 열어 두세요. 보이는 작은 창에서도 감지를 계속 확인해요.
          게임 창은 최소화하지 마세요. 공유 상태가 '화면이 멈춤'이거나 '화면 공유가 끝났어요'로 바뀌면 공유를 다시 시작해 주세요.
        </p>
      </>
    ),
  },
  {
    id: "game",
    title: "게임 안 설정",
    body: (
      <>
        <p>숫자와 아이콘이 늘 같은 모양으로 보여야 잘 읽어요. 게임의 설정 &gt; UI 에서:</p>
        <ul className="guide-list">
          <li>
            UI 크기: <b>최적 비율</b>
          </li>
          <li>
            퀵슬롯&amp;버프 시간표시: <b>중앙, 크게</b> / 표시 방식: <b>분 + 초</b>
          </li>
          <li>
            버프 정렬 옵션: <b>모두 켜기</b>
          </li>
          <li>
            정밀 스킬을 즐겨찾기에 뒀다면 <b>설정 → 버프 즐겨찾기 → 좌측·우측 하단</b>을 고르세요. 퀵슬롯 위에서 찾아요.
          </li>
        </ul>
        <p>해상도가 바뀌면 자동 감지 위치도 맞춰져요. 직접 지정한 영역은 해상도별로 기억해요.</p>
      </>
    ),
  },
  {
    id: "skills",
    title: "스킬 알림",
    body: (
      <>
        <p>솔 야누스: 새벽과 에르다 파운틴의 버프 아이콘을 찾고, 남은 시간을 읽어 알려요.</p>
        <Checks ok={[<>기본 버프칸은 자동 감지</>, <>즐겨찾기는 좌측·우측 하단만 선택 (두 스킬 공통)</>]}
          warn={[<>게임에서 버프 남은 시간 표시를 켜 두세요</>, <>위치가 특이하거나 감지가 안 되면 즐겨찾기의 '직접 지정'을 사용하세요</>]} />
      </>
    ),
  },
  {
    id: "rune",
    title: "룬 알림",
    body: (
      <>
        <p>미니맵 안쪽에서 룬 색깔(또는 등록한 룬 아이콘)을 찾아 두 번 연달아 보이면 알려요. 맵을 옮기면 새로 찾아요.</p>
        <Checks
          ok={[<>미니맵의 제목줄·버튼은 빼고 <b>지도 부분만</b> 선택</>, <>룬 모양은 프로그램에 들어 있어서 따로 등록할 필요 없어요</>]}
          warn={[<>맵마다 미니맵 크기가 달라서, 마을 말고 실제 사냥터에서 고르세요</>, <>보라색 배경이 많은 맵은 헷갈릴 수 있어요</>]}
        />
      </>
    ),
  },
  {
    id: "stall",
    title: "사냥 멈춤",
    body: (
      <>
        <p>고른 영역이 N초 동안 안 바뀌면 사냥이 멈춘 걸로 보고 알려요.</p>
        <Checks
          ok={[
            <><b>경험치 인식</b>: 하단 중앙 40%를 확인해요. 안 맞으면 높이 조정에서 숫자 줄을 클릭하세요</>,
            <><b>쿨타임 인식</b>: 사냥 중 계속 쓰는 짧은 쿨타임 스킬 아이콘</>,
            <><b>마나 인식</b>: MP 숫자 (마나를 계속 쓰는 직업)</>,
          ]}
          warn={[<>사냥을 시작해 한 번 바뀐 뒤부터 재기 시작해요</>, <>버프 연계를 켜면 그 버프가 있을 때만 봐요</>]}
        />
      </>
    ),
  },
  {
    id: "buffs",
    title: "버프 종료 · 특수 코어 알림",
    body: (
      <>
        <p>오른쪽 위 버프칸에서 등록한 아이콘을 찾아, 아이콘 위의 남은 시간을 읽고 끝나기 전에 알려요. 특수 코어는 아이콘이 뜬 순간부터 쿨타임을 세요.</p>
        <BuffbarSteps />
        <Checks
          ok={[<>버프가 있을 때 '일치도'가 '일치 기준'보다 높고, 없을 때 낮은지</>, <>'읽은 숫자'가 화면 숫자와 같은지</>]}
          warn={[<>켜기 전부터 걸려 있던 버프는 숫자를 못 읽으면 사라질 때만 알 수 있어요</>, <>다른 버프와 헷갈리면 비교 방식을 '아이콘 전체 (숫자 부분만 제외)'로</>]}
        />
      </>
    ),
  },
  {
    id: "booster",
    title: "부스터",
    body: (
      <>
        <p>화면 위쪽 부스터 상자의 디지털 시계 모양 숫자(예: 36.83)에서 초를 읽어 끝나기 전에 알려요. 학습 없이 바로 읽어요.</p>
        <Checks ok={[<>부스터를 켜면 위쪽 중앙에서 자동으로 찾아요</>, <>부스터가 켜져 있을 때 '읽은 값'이 화면과 같은지</>]} warn={[<>숫자 위로 퀘스트 알림 글자가 지나가도 읽지만, 상자를 가리는 창은 피하세요</>]} />
      </>
    ),
  },
  {
    id: "timers",
    title: "일반 타이머 · PIP",
    body: (
      <>
        <p>
          재획 비약·유니온의 부처럼 화면에서 읽지 않는 시간은 일반 타이머로 재요. 줄에서 30분 / 20분 / 10분 / 2시간 / 직접 중에 고르고, 끝나면
          자동으로 다시 시작하게 할 수 있어요. 버프 연계를 켜면 그 버프 아이콘이 나타날 때 저절로 시작해요.
        </p>
        <p>
          <b>PIP 타이머</b>는 게임 위에 늘 떠 있는 작은 창이에요. 맨 위에 '다음 알림'이 크게 나오고, PIP 오른쪽 위 <b>⚙</b> 에서 창·글자 크기, 보일 항목,
          알림 때 모양을 바로 바꿀 수 있어요. 스킬 줄을 누르면 지금 쓴 것으로 타이머를 시작해요.
        </p>
      </>
    ),
  },
  {
    id: "digits",
    title: "숫자 읽기",
    body: (
      <>
        <p>실제 게임 숫자 모양이 들어 있어서 따로 할 일은 없어요. 쓰다 보면 이 PC 화면에 맞춰 자동으로 더 배워요.</p>
      </>
    ),
  },
  {
    id: "trouble",
    title: "잘 안 될 때",
    body: (
      <ol className="art-steps">
        <li>
          맨 위 <b>준비 체크리스트</b>에서 빠진 단계가 있는지
        </li>
        <li>
          공유 표시가 <b>'화면이 검게 나와요'</b>면 '다른 창 선택' → 전체 화면(모니터)으로
        </li>
        <li>
          각 줄의 ▾ → <b>진단</b>에서 실제로 잘린 영역과 수치를 보고 기준값 조절
        </li>
        <li>
          소리가 안 나면 페이지를 한 번 클릭했는지, 마스터 볼륨 옆 🔇(소리 꺼짐)·탭 음소거·시스템 볼륨 확인
        </li>
        <li>
          그래도 이상하면 문제가 생긴 <b>직후</b> 설정 &gt; <b>진단 파일 저장</b>을 눌러 두세요. 최근 30초 동안의 감지 영역과 설정이 같이 들어 있어서
          그 상황을 그대로 다시 돌려 보며 고칠 수 있어요.
        </li>
      </ol>
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
            <p className="muted small">
              비공식 개인용 도구예요. 공유한 화면은 이 브라우저 안에서만 분석하고 어디에도 보내지 않지만, 사용에 따른 책임은 본인에게 있어요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
