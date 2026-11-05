# Maple Timer 데스크톱 0.1.51 — 웹 이식 사전 분석

분석일: 2026-11-04. 요청 범위: 제공된 바로가기의 실제 설치본을 REA로 읽고 기존 웹버전과 비교하기.
이번 작업은 정적 분석이다. 프로그램 실행, 로그인, 게임 캡처, 모델 추론, 장시간 최소화 테스트는 수행하지 않았다.
웹 앱 소스와 배포는 변경하지 않았다.

## 1. 분석한 대상과 근거

- 바로가기: `C:/Users/choic/OneDrive/바탕 화면/메이플 타이머.lnk`
- 실행 파일: `C:/Users/choic/AppData/Local/Programs/maple-timer-desktop/MapleTimer.exe`
- 실제 앱 패키지: 같은 폴더의 `resources/app.asar` (119,870,125 bytes)
- `package.json`: `maple-timer-desktop`, 버전 `0.1.51`, 진입점 `electron/main.cjs`.
- `renderer/build-info.json`: 커밋 `0b6fcdbf4b9664b13e4476d0c0e3bf877187b1a2`, 브랜치 `release-0-1-51`, 빌드 시각 `2026-11-04T11:11:57.799Z`.
- REA가 관찰한 ASAR SHA-256: `91b848f1fb48044c7d974debb64633067d33848dac55bdb09fc14eb573896a55`.

REA Evidence:

1. 앱 진입점·preload·캡처 선택·PIP·정적 자원 제공·타이머 워커 관련 분석
   - parent: `ev_16f68ce15fec59c0f74a253efd37963d720ec1ea7226501bf89d22175575b688`
   - summary: `ev_b233e4575a7bfdf247276193766cebbd63122b0c1506b545dd496ccee9f5d5ab`
   - 정확히 지정한 9개 경로만 분석. 나머지 파일의 관계는 미확인.
2. 모델 준비·키 상태 관리·실험 기능 스위치·설정·사냥 기록·PIP 편집 화면 분석
   - parent: `ev_64bac9fd76efa2cc61dae9185633c2f5eadd83023041e4b0ee4f871bc2136f10`
   - 정확히 지정한 8개 경로만 분석. 의미 그래프는 파일당 1,500개/전체 5,000개 노드 제한을 적용했으며 일부 관계가 생략됐다.

추가로 ASAR 헤더를 실행 없이 읽고, 선택한 평문 파일을 직접 읽었다. 앱 코드는 실행하지 않았다.
큰 renderer 번들은 API 사용 지점과 관련 문자열 주변을 읽었으며 전체 제어 흐름을 복원한 것은 아니다.
로컬 검토용 파일은 `.rea-local-review/`에 있고 내부 `.gitignore`로 Git에서 제외된다.

## 2. 구조

```text
Electron main process
  ├─ 창/트레이/자동 시작/업데이트
  ├─ 캡처 대상 선택 (desktopCapturer + IPC)
  ├─ 계정·서버 요청·모델 키 관리
  └─ app://maple 정적 파일 및 모델 응답
       ↓ preload의 제한된 contextBridge/IPC
웹 renderer
  ├─ 화면 공유 → video/canvas → 필요한 영역 픽셀
  ├─ 스킬/룬/버프/부스터/사냥 상태별 Worker 호출
  ├─ ONNX Runtime의 WASM/WebGPU 관련 실행 경로
  └─ 알림·일반 타이머·PIP·설정·사냥 기록
```

근거: `electron/main.cjs`, `preload.cjs`, `sourcePicker.cjs`, `appProtocol.cjs`,
`renderer/assets/main-C-gHpru0.js`, `renderer/runtime-module-manifest.json`.
이 그림은 정적으로 관찰한 구성과 호출 후보를 요약한다. 실행 시 모든 경로가 활성화된다는 뜻은 아니다.

## 3. 기존 웹버전과의 차이

| 분야 | 설치본에서 확인한 구성 | 현재 웹버전 | 이식 시 처리 |
|---|---|---|---|
| 화면 공유 | renderer의 getDisplayMedia + Electron 캡처 목록/선택 IPC | getDisplayMedia + TrackProcessor/video 대체 경로 | OS가 제공하는 브라우저 선택창으로 교체 |
| 정밀 스킬 | 전용 분석 워커, 버프 탐지 모델, 스킬별 모델/프로토타입 자원 | 등록 아이콘 템플릿 매칭과 숫자 학습 | 평문 소스·모델이 있으면 브라우저 Worker 인터페이스로 통합; 없으면 별도 구현 |
| 룬 | 전용 룬 워커, cascade v15 proposal/verifier ONNX 파일 | 색상/등록 템플릿 감지 | 모델 추론으로 전환하려면 원본 모델 및 입력/출력 계약 필요 |
| 사냥 멈춤 | 쿨타임/OCR/무아/임펠 전용 워커가 패키지에 존재 | 선택 영역의 변화 감지 | 기능별 상태 추적을 분리해 확장 |
| 버프 종료·특수 코어 | 버프칸 분석, 그룹별 모델, 전용 특수 코어 워커 | 사용자 등록 아이콘·숫자·쿨타임 | 자동 버프칸 탐지와 분류 엔진이 핵심 차이 |
| 부스터 | 전용 booster V3 워커와 위치 탐지/존재/숫자 모델 | 선택 영역 숫자 판독 | 위치 탐지와 숫자 신뢰도 검증을 보강 |
| 일반 타이머 | 별도 ticker 워커와 UI/설정 | 별도 ticker 워커와 알림 엔진 | 웹에서 재구현 가능 |
| PIP | Electron 창 제어 + 웹 편집 화면 | Document Picture-in-Picture | 편집 UI는 옮길 수 있음; Electron 창 제어는 별도 대체 |
| 사냥 통계·기록 | huntMetrics 워커, 경험치/솔 에르다 자원, 이력 UI 및 서버 동기화 코드 | 일반 타이머/진단 중심 | 로컬 기록부터 구현하고 동기화는 별도 서버 설계 |
| 계정·클라우드 설정 | preload IPC → desktop 전용 서버 요청 | 브라우저 로컬 설정/프리셋 | 원본 서버 사용 가능 여부와 별도로 웹용 인증/API가 필요 |

모델 역할 중 파일명·manifest에 근거한 항목은 구성의 증거다. 암호화된 내부 추론 알고리즘이나 실제 정확도는 확인하지 못했다.

## 4. 백그라운드·최소화 문제와 직접 관련된 부분

`electron/main.cjs:114` 부근은 시작 시 다음 Chromium 옵션을 설정한다.

- `disable-background-timer-throttling`
- `disable-renderer-backgrounding`
- `disable-backgrounding-occluded-windows`

메인 창의 `webPreferences`와 PIP 창 옵션에도 `backgroundThrottling: false`가 있다.
최소화/복원/숨김/표시 이벤트는 IPC로 renderer에 별도 전달한다.

**관찰:** 설치본은 브라우저 엔진의 실행 정책을 앱 수준에서 직접 설정한다.
**판단:** 일반 웹 페이지 JavaScript에는 이 Electron 설정을 그대로 적용할 방법이 없다.
따라서 화면과 기능을 웹으로 옮겨도 설치본과 동일한 최소화 동작을 자동으로 얻지는 않는다.

현재 웹버전은 프레임 수신·워커 타이머·보이는 PIP 창에서 분석을 깨우는 보강이 되어 있다.
더 긴 인식 처리는 브라우저 Worker로 분리하는 것이 적절하지만, 페이지 전체 정지나
게임 자체가 새 프레임을 만들지 않는 상황은 별도의 한계다.
설치본이 게임 최소화 상태에서도 실제로 계속 인식하는지는 이번 분석으로 입증하지 못했다.

## 5. 설치 파일을 그대로 웹에 올릴 수 없는 이유

1. **Electron 의존성:** preload가 창·공유 대상·인증·업데이트·서버 요청을 IPC로 제공한다.
   일반 브라우저에는 이 bridge가 없으므로 플랫폼 어댑터를 교체해야 한다.
2. **암호화된 모델과 워커:** 샘플로 읽은
   `renderer/models/code/runeDetection.worker-lW-hKMUv.js`와
   `renderer/models/center-ocr-v8/manifest.json`은 UTF-8 코드/JSON 대신 `MTMODEL3` 헤더로 시작한다.
   `appProtocol.cjs`는 `models/` 아래 암호화된 응답을 모델 키로 열어 반환한다.
   `auth/modelKeys.cjs`에는 계정 서버에서 버전별 키를 받는 관리 흐름이 있고,
   `modelCheck.cjs`는 모델 종류별 대표 파일을 열어 준비 여부를 검사한다.
   이번에는 키를 획득하거나 보호된 자원을 복호화하지 않았다.
3. **desktop 전용 API:** 사냥 기록 등에 `/desktop/v1/hunt-records` 경로를 사용한다.
   브라우저에서 같은 주소를 호출해도 인증·교차 출처·사용 계약이 같다고 볼 수 없다.
4. **원격/실험 기능:** 코드에 있다고 항상 켜져 있지는 않다.
   build info에는 `remoteRecognitionV1TestArm: false`가 있다.
   `runeW2a.cjs`, `huntDashboardLocal.cjs`는 시작 시 로컬 파일 존재 여부로 실험 기능을 선택한다.
   패키지 안의 모든 기능을 실제 출시 활성 기능으로 취급하면 안 된다.

원본 개발 프로젝트와 평문 모델을 확보할 수 있다면 위의 암호화된 설치 자원을 분석하는 것보다
그 프로젝트의 웹 renderer·Worker·모델 계약을 기준으로 이식하는 편이 정확하다.

## 6. 웹버전으로 옮기는 권장 순서

1. **원본 입력 확인:** 해당 버전의 개발 소스, 모델 파일, 모델 입출력 명세가 있는지 확인.
2. **플랫폼 경계 분리:** 캡처·저장·PIP·계정·네트워크를 브라우저 어댑터로 분리.
3. **정밀 인식 우선:** 버프칸 탐지 → 아이콘 분류 → 숫자 읽기 → 시간 흐름 검증 순서로 통합.
   먼저 야누스/파운틴 한 쌍으로 실제 게임 화면 테스트.
4. **워커 수명 관리:** 작업 중 중복 프레임 방지, 최신 프레임 선택, timeout/restart,
   오래된 응답 폐기, 사용하지 않는 모델/session 해제 및 GPU 실패 대체 경로를 구현.
5. **기능 확장:** 룬·부스터·특수 코어·무아/임펠·사냥 통계를 각각 검증한 뒤 붙임.
6. **기록/설정:** 프리셋·사냥 이력은 로컬부터 제공하고 동기화는 웹용 서버와 연결.
7. **실사용 검증:** 실제 게임 화면에서 전경/다른 탭/PIP/크롬 최소화/게임 최소화를 나눠
   프레임 도착·분석 주기·감지값·알림 시간을 기록. 데모 화면 성공과 구분해 판정.

## 7. 이번에 확인한 것과 남은 것

- [x] 바로가기의 정확한 설치 대상·버전·빌드 식별
- [x] Electron/웹 renderer/Worker/모델 자원의 구성 확인
- [x] 데스크톱 백그라운드 실행 설정과 웹의 차이 확인
- [x] 보호된 인식 자원과 키 관리 의존성 확인
- [x] 현재 웹 코드와 기능별 이식 방향 비교
- [ ] 암호화된 인식 워커의 실제 알고리즘·모델 입출력 확인
- [ ] 계정·원격 처리·실험 기능의 실제 활성 상태 확인
- [ ] 실제 게임에서 정확도·장시간 최소화 동작 검증
- [ ] 웹 이식 구현 및 배포

결론: 웹 이식 가능성이 높은 Electron 기반 앱이지만, 설치 파일만 정적 호스팅하는 작업으로는 완성되지 않는다.
자동 인식의 동일성을 좌우하는 핵심은 평문 Worker/모델 및 그 계약의 확보이고,
백그라운드 실행 보장은 웹과 데스크톱을 별도로 검증해야 한다.

## 8. 추가 확인 (2026-11-05): 분석 워커의 작업 관리 방식

대상: `MapleTimer-Setup-0.1.51.exe` (184,093,189 bytes). 설치 파일은 실행하지 않았다.
안에 든 7z를 따로 꺼내 `resources/app.asar`만 풀었고, 크기(119,870,125 bytes)가 1절의 설치본과 같다.

- 기능별 워커(`renderer/models/code/*.worker-*.js`: 버프칸 분석, 정밀 버프 종료, 부스터 V3, 룬, 특수 코어 등)는
  `MTMODEL3` 머리말로 **암호화**되어 있고 열쇠는 서버에서 받는다. **복호화하지 않았다.**
- 평문인 `renderer/assets/main-*.js`에서 워커를 부르는 쪽의 검증 규칙만 읽었다. 확인한 생각은 아래와 같다.
  - 요청마다 `requestId`·`workerGeneration`·`frameId`를 붙이고, 단계를 `requested / completed / applied / failed / timeout / busy / stale`로 나눈다.
  - 시간 제한은 처음(cold) 30초, 그다음(warm) 1.5초다. 시간이 넘으면 워커를 `reset`하고 세대를 바꾼다.
- 원본의 코드·모델·그림은 가져오지 않았다. 위의 생각만 참고해 우리 방식으로 새로 짰다.

### 우리 앱에 반영한 것

- `src/engine/search/`: 버프칸 전체 탐색을 전용 워커로 옮겼다.
  - 탐색 계산(`buffSearch.ts`)은 화면(DOM)에 손대지 않는다. 그래서 워커와 메인 스레드가 같은 코드를 쓴다.
  - 관리(`buffSearcher.ts`)는 한 번에 한 작업만 받는다. 바쁘면 그 화면은 건너뛰고 쌓지 않는다(busy).
  - 시간 제한은 처음 10초, 그다음 2초다. 시간 초과나 오류가 나면 워커를 새로 만들고, 예전 워커의 늦은 답은 버린다.
    워커가 연달아 3번 실패하면 메인 스레드에서 계산하는 방식으로 바꾼다.
  - 결과를 반영하기 전에 공유 세션, 관측 초기화 번호, 버프마다의 영역이 요청 때와 같은지 확인한다.
    다르면 쓰지 않는다(stale).
- 데모 화면(1280×720)에서 메인 스레드의 버프 감지 시간이 약 101 ms에서 1.9 ms로 줄었다.
  탐색 자체(약 100 ms)는 워커에서 돈다. 실제 게임에서의 측정은 아직이다.
- 진단 파일의 `live.buffSearch`에 방식(worker/inline), 세대, 요청·완료·busy·시간 초과·오류 수,
  마지막 탐색 시간과 받기까지 걸린 시간을 남긴다.
