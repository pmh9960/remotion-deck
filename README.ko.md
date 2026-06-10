# remotion-deck

[English](./README.md) · **한국어**

[Remotion](https://remotion.dev)으로 **발표용 슬라이드 덱**을 만듭니다 — 프레임 기반 슬라이드
애니메이션(`useCurrentFrame`, `spring`, …), 좌우 키 넘김, 한 줄 명령 PDF 변환.

**Remotion 공개 API를 감싸는 얇은 wrapper**입니다. Remotion을 `peerDependency`로 두기 때문에,
덱은 프로젝트가 설치한 Remotion 버전을 그대로 탑니다 — `npm update remotion` 한 번이면 새 버전으로
넘어가고, wrapper를 다시 릴리즈할 필요가 없습니다.

## 빠른 시작: deck.json + 비주얼 에디터

가장 빠른 사용법은 **코드가 아니라 데이터** — CLI가 비주얼로(파워포인트처럼) 편집·재생·내보내기
하는 단일 `deck.json` 하나입니다.

```bash
# 아직 npm 미배포 — GitHub에서 바로 설치 (prepare 스크립트가 설치 시 빌드).
npm i pmh9960/remotion-deck remotion @remotion/player
npm i -D @remotion/bundler @remotion/renderer   # PDF 변환에만 필요

npx remotion-deck init      # deck.json (+ package.json) 생성
npx remotion-deck dev       # 비주얼 에디터 열기
npx remotion-deck pdf       # → presentation.pdf   (또는 html → 단일 .html)
```

에디터에서: 드래그/리사이즈(Shift = 축/비율 고정), 다중선택 + 정렬/분배, 리치 텍스트(B/I/U·
글머리표), 도형·이미지 삽입(붙여넣기·드롭), 액션 단위 undo, 그리고 덱을 고쳐주는 채팅창. 사용자와
Claude가 **같은** `deck.json`을 편집합니다.

### Claude Code 스킬

패키지를 설치해도 스킬은 자동 설치되지 **않습니다**(스킬은 Claude Code 아티팩트). 다음으로 추가:

```bash
npx remotion-deck skill            # 이 프로젝트  → ./.claude/skills
npx remotion-deck skill --global   # 모든 프로젝트 → ~/.claude/skills
```

그러면 Claude가 프롬프트만으로 `deck.json`을 생성·리스타일할 수 있습니다.

### Headless / 원격 (리눅스 서버)

`dev`, `present`, `html`은 호스트에 브라우저가 필요 없습니다 — 네트워크에 바인딩해 원격 접속:

```bash
remotion-deck dev --host    # Network URL 출력; 다른 기기에서 열기
```

`pdf`만 headless Chromium을 거칩니다(Remotion이 자동 다운로드; 최소 리눅스에선 `libnss3`/`libatk`
같은 라이브러리가 필요할 수 있음). 서버에서 공유용 산출물은 **의존성 없는** `html`이 가장 간편합니다.

## 설치 (라이브러리 API)

`SlideDeck`/`registerDeck`을 import해서 슬라이드를 React 컴포넌트로 작성하는 프로젝트용:

```bash
npm i remotion-deck remotion @remotion/player   # 미배포 동안은: pmh9960/remotion-deck
# PDF 변환에는 추가로:
npm i -D @remotion/bundler @remotion/renderer
```

## 발표 (브라우저)

```tsx
import { SlideDeck, type SlideDef } from "remotion-deck";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

const Hello = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity, color: "#fff", fontSize: 96 }}>Hello</AbsoluteFill>;
};

const SLIDES: SlideDef[] = [
  { id: "hello", component: Hello, durationInFrames: 60 },
  // …더 추가; 배열 순서 == 발표 순서 == PDF 페이지 순서
];

export default () => <SlideDeck slides={SLIDES} config={{ fps: 30, width: 1920, height: 1080 }} />;
```

- **→ / Space / 클릭** 다음 · **←** 이전 · **Home / End** 처음 / 끝
- 슬라이드 진입 시 인트로 애니메이션이 0프레임부터 다시 재생됩니다.

> 재생은 `play()`/`autoPlay`가 아니라 `requestAnimationFrame` 루프에서 `PlayerRef.seekTo()`로
> 구동합니다 — `play()`/`autoPlay`는 브라우저 autoplay 정책에 막혀 덱이 0프레임에 멈출 수 있기
> 때문입니다.

## PDF 변환

덱을 등록하는 Remotion 엔트리를 만듭니다:

```ts
// remotion-entry.ts
import { registerDeck } from "remotion-deck";
import { SLIDES, DECK } from "./deck";
registerDeck(SLIDES, DECK);
```

그리고 렌더(Node):

```ts
import { renderDeckToPdf } from "remotion-deck/node";

await renderDeckToPdf({
  entryPoint: "./remotion-entry.ts",
  output: "./presentation.pdf",
  // frame: "last" (기본) | 숫자 | (comp) => number
});
```

각 페이지는 슬라이드의 선택된 프레임(기본: **마지막** 프레임 = 완성된 상태)을 컴포지션 원본
해상도로 담습니다. PDF는 정적이라 움직임은 안 담기고 스냅샷만 들어갑니다.

## API

| export | 위치 | 역할 |
|---|---|---|
| `SlideDeck` | `remotion-deck` | React 발표 화면 (Player + 키보드 넘김) |
| `registerDeck`, `makeDeckRoot` | `remotion-deck` | 슬라이드를 Remotion 컴포지션으로 등록 |
| `renderDeckToPdf` | `remotion-deck/node` | 덱 → PDF (Node 전용) |
| `SlideDef`, `DeckConfig` | `remotion-deck` | 타입 |

## Remotion 버전을 따라가는 방식

- **peerDependencies** (`remotion`, `@remotion/*` → `>=4 <5`) — 실제로 실행되는 건 소비자의
  Remotion 버전이며, wrapper는 절대 고정하지 않습니다.
- **[Renovate](https://docs.renovatebot.com/)** (`renovate.json`) — Remotion 패키지들을 한
  PR로 묶어 자동 업데이트(버전이 함께 움직여야 하므로).
- **CI** (`.github/workflows/ci.yml`) — 모든 PR에서 빌드 + PDF 스모크 렌더를, 고정 버전과
  `latest` Remotion **매트릭스**로 실행 → wrapper를 깨는 업데이트는 머지 전에 실패. Remotion
  **major**는 수동 검토로 보류(peer 범위 상한 `<5`).

## 개발

```bash
npm install
npm run example   # 예제 덱을 브라우저에서 실행
npm test          # 빌드 + 스모크 (예제 → PDF 렌더, 페이지 수 검증)
```

## 라이선스

이 wrapper의 소스 코드 자체는 **MIT**입니다([LICENSE](./LICENSE)). Remotion을 **번들/재배포하지
않고** `peerDependencies`로만 참조합니다.

> [!IMPORTANT]
> **Remotion 본체는 MIT가 아닙니다.** 소스 공개형 [Remotion License](https://www.remotion.dev/docs/license)를
> 따릅니다. **개인, 직원 3명 이하 영리 회사, 비영리**는 무료이며, 더 큰 회사는
> [remotion.pro](https://www.remotion.pro/)에서 **Company License**를 구매해야 합니다.
> `remotion-deck`을 쓰면 Remotion을 쓰는 것이므로 Remotion 라이선스의 적용을 받습니다 — 이
> wrapper의 MIT 라이선스와 무관하게요. [NOTICE](./NOTICE) 참고.

`SlideDeck`은 내부 `<Player>`에 `acknowledgeRemotionLicense`를 전달해 런타임 콘솔 경고를
끕니다. 이는 편의 기능일 뿐 Remotion 라이선스 의무를 바꾸지 않습니다.
