/**
 * 가이드용 그림. 실제 게임 화면 대신 위치와 모양만 단순하게 그린다 (게임 이미지는 쓰지 않음).
 */

/** 버프칸 그림에 들어갈 아이콘: 색과 남은 시간 표시 */
const ICONS: Array<{ hue: number; time?: string }> = [
  { hue: 205, time: "1:52" },
  { hue: 32, time: "47" },
  { hue: 280 },
  { hue: 140, time: "12" },
  { hue: 0, time: "3:05" },
  { hue: 55 },
];

/**
 * 우상단 버프칸 그림.
 * mark: bar = 버프칸 전체 선택 / icon = 아이콘 하나 등록 / time = 아이콘 위 숫자 읽기
 */
export function MockBuffBar({ mark }: { mark?: "bar" | "icon" | "time" }) {
  return (
    <div className="mock-buffbar-wrap">
      <div className={`mock-buffbar ${mark === "bar" ? "mock-mark" : ""}`}>
        {ICONS.map((ic, i) => (
          <div key={i} className={`mock-icon ${mark === "icon" && i === 1 ? "mock-mark" : ""}`} style={{ "--hue": ic.hue } as React.CSSProperties}>
            {ic.time && <span className={`mock-time ${mark === "time" && i === 1 ? "mock-mark-round" : ""}`}>{ic.time}</span>}
          </div>
        ))}
      </div>
      {mark === "bar" && <span className="mock-note">버프칸 전체를 넉넉하게</span>}
      {mark === "icon" && <span className="mock-note">아이콘 하나만 테두리에 딱 맞게</span>}
      {mark === "time" && <span className="mock-note">이 숫자를 읽어서 끝나는 시각을 맞춰요</span>}
    </div>
  );
}

/** 게임 화면 전체에서 기능별로 고르는 영역 위치 */
export function MockScreen() {
  return (
    <div className="mock-screen" role="img" aria-label="게임 화면에서 기능별 영역 위치">
      <div className="mock-zone" style={{ left: "1.5%", top: "4%", width: "20%", height: "22%" }}>
        <b>미니맵 안쪽</b>
        <span>룬 알림</span>
      </div>
      <div className="mock-zone" style={{ left: "40%", top: "4%", width: "18%", height: "11%" }}>
        <b>부스터 남은시간</b>
        <span>부스터 알림</span>
      </div>
      <div className="mock-zone" style={{ right: "1.5%", top: "4%", width: "30%", height: "13%" }}>
        <b>버프칸</b>
        <span>버프 종료 · 특수 코어</span>
      </div>
      <div className="mock-char" />
      <div className="mock-zone" style={{ right: "1.5%", bottom: "9%", width: "26%", height: "17%" }}>
        <b>퀵슬롯 아이콘</b>
        <span>스킬 알림</span>
      </div>
      <div className="mock-zone mock-zone-exp" style={{ left: "1.5%", bottom: "2%", width: "97%", height: "5%" }}>
        <b>경험치 숫자</b>
        <span>사냥 멈춤</span>
      </div>
    </div>
  );
}

/** 버프칸 감지 설정 순서 (버프칸 패널과 가이드에서 같이 씀) */
export function BuffbarSteps() {
  return (
    <ol className="art-steps">
      <li>
        <b>게임 설정:</b> 감지할 버프는 <b>버프 즐겨찾기에서 빼 주세요.</b> 즐겨찾기에 들어간 버프는 남은 시간이 버프칸에 안 보여요. UI 설정의 퀵슬롯&amp;버프
        시간표시는 <b>중앙, 크게</b>, 표시 방식은 <b>분 + 초</b>로 두세요.
      </li>
      <li>
        <b>버프칸 선택:</b> 오른쪽 위 버프 아이콘이 뜨는 줄 전체를 잡아요. 버프가 늘어나도 들어가게 왼쪽으로 넉넉하게.
        <MockBuffBar mark="bar" />
      </li>
      <li>
        <b>아이콘 등록:</b> 감지할 버프가 걸려 있을 때 그 아이콘 하나만 테두리에 맞춰 잡아요. 이 모양으로 버프칸 안에서 위치가 바뀌어도 찾아요.
        <MockBuffBar mark="icon" />
      </li>
      <li>
        <b>남은 시간 읽기:</b> 찾은 아이콘 위의 숫자를 읽어서 끝나는 시각을 맞추고, 알림 시점이 되면 알려요. 숫자를 못 읽으면 나타난 순간부터 지속시간을
        세거나, 아이콘이 사라질 때 알려요.
        <MockBuffBar mark="time" />
      </li>
    </ol>
  );
}
