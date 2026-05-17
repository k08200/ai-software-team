# AI Software Engineering Team

> 한 줄 아이디어 → 7개 AI 에이전트 → 완전한 프로덕션 코드

## 개요

제품 아이디어를 한 문장으로 입력하면, 7개의 전문 AI 에이전트가 자율적으로 협업하여 완전한 프로덕션 코드를 생성합니다.

## 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                   사용자 입력 (한 줄 아이디어)               │
└─────────────────────────┬───────────────────────────────┘
                          │
          ┌───────────────▼──────────────┐
          │         Pipeline             │
          │  Orchestrator (Node.js)      │
          └──┬────────────────────────┬──┘
             │   SSE Streaming        │
             ▼                        ▼
    ┌────────────────┐      ┌─────────────────┐
    │  Claude API    │      │  React Frontend  │
    │  (Opus 4.6)    │      │  (Vite + Tailwind│
    │  + Extended    │      │   + Zustand)     │
    │  Thinking      │      └─────────────────┘
    └────────────────┘

Agent Pipeline:
┌─────┐   ┌────┐   ┌─────────┐   ┌──────────┐
│ CTO │ → │ PM │ → │ Backend │ → │ Frontend │
└─────┘   └────┘   └─────────┘   └──────────┘
                                       │
                    ┌──────────────────┘
                    │  Iteration Loop (min 3 rounds)
                    ▼
          ┌────┐  ┌──────────┐  ┌────────┐
          │ QA │→ │ Security │→ │ Review │
          └────┘  └──────────┘  └────────┘
                    │ (issues > 0 → repeat)
                    └──────────────────────┘
```

## 에이전트 설명

| 에이전트 | 역할 |
|---------|-----|
| 🏗️ CTO Agent | 시스템 아키텍처 + 기술 스택 결정 |
| 📋 PM Agent | PRD + 유저 스토리 + API 스펙 작성 |
| ⚙️ Backend Agent | 서버 코드 완전 구현 |
| 🎨 Frontend Agent | UI 완전 구현 |
| 🧪 QA Agent | 테스트 작성 + 버그 목록 생성 |
| 🔒 Security Agent | OWASP Top 10 기준 취약점 스캔 |
| 👁️ Review Agent | 전체 코드 리뷰 → 개선 이슈 리스트 |

## 빠른 시작

### 1. 사전 요구사항
- Node.js 20+
- Anthropic API Key

### 2. 설치

```bash
# 의존성 설치
make install
# 또는
npm install
```

### 3. 환경 변수 설정

```bash
cp .env.example server/.env
# server/.env 파일에서 ANTHROPIC_API_KEY 설정
```

```env
ANTHROPIC_API_KEY=your_api_key_here
```

### 4. 실행

```bash
make dev
# 또는
npm run dev
```

브라우저에서 http://localhost:3000 열기

## 사용 방법

1. 입력창에 제품 아이디어 입력 (예: "할 일 앱 만들어줘")
2. "AI팀 시작하기" 클릭
3. 7개 에이전트가 순서대로 작업하는 것을 실시간으로 확인
4. QA/Security/Review 라운드에서 이슈가 0이 될 때까지 반복
5. 완성된 코드를 ZIP으로 다운로드

## 기능

- ✅ 실시간 스트리밍 (SSE)
- ✅ 에이전트별 진행 상태 시각화
- ✅ Extended Thinking 표시/숨기기
- ✅ 라운드별 이슈 감소 현황
- ✅ 실시간 토큰 카운터
- ✅ 코드/문서 ZIP 다운로드
- ✅ 에러 처리 및 재시도

## 환경 변수

| 변수 | 기본값 | 설명 |
|-----|--------|-----|
| `ANTHROPIC_API_KEY` | 필수 | Anthropic API 키 |
| `ANTHROPIC_MODEL` | `claude-opus-4-6` | 사용할 Claude 모델 |
| `THINKING_BUDGET` | `8000` | Extended thinking 토큰 예산 |
| `MAX_ROUNDS` | `3` | 최대 반복 라운드 수 |
| `MIN_ROUNDS` | `3` | 최소 반복 라운드 수 |
| `PORT` | `3001` | 서버 포트 |

## 테스트

```bash
# 전체 테스트
make test

# 커버리지 포함
make test-coverage
```

## 기술 스택

**Backend**
- Node.js 20 + TypeScript 5
- Express 4 (SSE streaming)
- @anthropic-ai/sdk (latest)
- Extended Thinking 활성화

**Frontend**
- React 18 + TypeScript
- Vite 5 (빌드 도구)
| TailwindCSS 3 (스타일링)
- Zustand (상태 관리)
- SSE via fetch streaming

**Testing**
- Vitest (unit tests)
- @testing-library/react (component tests)
- 80%+ coverage target

## 주의사항

- `claude-opus-4-7`은 현재 존재하지 않습니다. 사용 가능한 최신 Opus 모델(`claude-opus-4-6`)을 사용합니다. `ANTHROPIC_MODEL` 환경변수로 변경 가능합니다.
- 각 에이전트 호출 시 Extended Thinking이 활성화됩니다 (`thinking: { type: "enabled" }`).
- 전체 파이프라인 실행에 상당한 API 토큰이 소비됩니다 (약 50,000~200,000 토큰).
