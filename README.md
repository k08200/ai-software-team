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
- Ollama (기본 무료 로컬 모델 실행)

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
# 기본값은 Ollama 로컬 provider입니다.
```

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:14b
```

Ollama에 모델이 없다면 먼저 설치합니다.

```bash
ollama pull qwen2.5-coder:14b
```

유료 cloud provider를 쓰고 싶을 때만 Anthropic 설정을 사용합니다.

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_MODEL=claude-opus-4-6
```

### 4. 실행

```bash
make dev
# 또는
npm run dev
```

브라우저에서 http://localhost:3000 열기

### 5. 로컬 Ollama 실행

Ollama가 `http://localhost:11434`에서 `Ollama is running`을 보여주면, 먼저 짧은 smoke 프로필로 실제 생성 흐름을 확인합니다. 앱의 기본 API URL은 Node의 IPv6 localhost 이슈를 피하기 위해 `http://127.0.0.1:11434`를 사용합니다. 이 모드는 CTO/PM/Backend/Frontend까지만 실행하고 QA/Security/Review 반복 라운드는 건너뛰므로 로컬 모델 첫 검증에 적합합니다.

```bash
npm run smoke:ollama -- "간단한 메모 앱 만들어줘"
```

생성된 backend/frontend가 실제로 설치 및 빌드되는지까지 확인하려면 검증 smoke를 실행합니다.

```bash
npm run smoke:ollama:verify -- "간단한 메모 앱 만들어줘"
```

아이디어에 맞춘 작은 풀스택 MVP를 가장 빠르게 만들고 싶으면 fast-mvp 프로필을 사용합니다. 이 모드는 CTO와 PM 단계를 하나의 planner 단계로 압축하고, Backend/Frontend만 이어서 실행해 무료 로컬 모델에서 기다리는 시간을 줄입니다.

```bash
npm run fast-mvp:ollama:verify -- "동네 카페 예약 관리 MVP 만들어줘"
```

더 자세한 기획 문서를 거친 MVP를 만들고 싶으면 mvp 프로필을 사용합니다. 이 모드는 무료 로컬 모델이 감당하기 쉽도록 의존성을 줄이고, 반복 리뷰 라운드는 건너뛰며, 생성 앱 미리보기를 위해 프론트엔드가 API 실패 시 로컬 데모 데이터로 동작하도록 지시합니다.

```bash
npm run mvp:ollama:verify -- "동네 카페 예약 관리 MVP 만들어줘"
```

검증은 생성 프로젝트를 임시 디렉터리로 복사한 뒤 실행하므로, ZIP 산출물에 `node_modules`나 `dist`가 섞이지 않습니다. Smoke/MVP 모드에서는 로컬 모델의 흔한 패키징 실수를 줄이기 위해 backend/frontend package manifest와 누락 CSS 참조를 최소 보정합니다.

여러 아이디어에서 MVP 성공률을 추적하려면 벤치마크 러너를 사용합니다. 기본 세트는 10개 아이디어이며, 처음에는 긴 실행을 피하려고 `--limit`로 작게 돌리는 것을 권장합니다. 결과는 `server/outputs/benchmark-reports/` 아래에 JSON과 Markdown 리포트로 저장되고, 설치/빌드 실패는 유형별로 자동 분류됩니다. 기본 벤치마크 프로필은 `fast-mvp`이며, 기존 `mvp`와 비교하려면 `--profile mvp`를 지정합니다.

```bash
npm run mvp:benchmark -- --list
npm run mvp:benchmark -- --limit 3
npm run mvp:benchmark -- --profile mvp --scenario cafe-reservations
npm run mvp:benchmark -- --scenario cafe-reservations
```

전체 검증까지 돌릴 준비가 됐을 때는 `PIPELINE_PROFILE=full`과 기본 라운드 설정을 사용합니다.

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
| `LLM_PROVIDER` | `ollama` | 사용할 LLM provider (`ollama` 또는 `anthropic`) |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama 로컬 API URL |
| `OLLAMA_MODEL` | `qwen2.5-coder:14b` | 사용할 Ollama 모델 |
| `ANTHROPIC_API_KEY` | 선택 | `LLM_PROVIDER=anthropic`일 때 필요한 Anthropic API 키 |
| `ANTHROPIC_MODEL` | `claude-opus-4-6` | Anthropic provider에서 사용할 Claude 모델 |
| `THINKING_BUDGET` | `8000` | Extended thinking 토큰 예산 |
| `PIPELINE_PROFILE` | `full` | 실행 프로필 (`full`, `fast-mvp`, `mvp`, `smoke`) |
| `MAX_ROUNDS` | `3` | 최대 반복 라운드 수 |
| `MIN_ROUNDS` | `3` | 최소 반복 라운드 수 |
| `SMOKE_MAX_TOKENS` | `768` | `PIPELINE_PROFILE=smoke`에서 에이전트별 최대 생성 토큰 |
| `FAST_MVP_MAX_TOKENS` | `4200` | `PIPELINE_PROFILE=fast-mvp`에서 에이전트별 최대 생성 토큰 |
| `MVP_MAX_TOKENS` | `6000` | `PIPELINE_PROFILE=mvp`에서 에이전트별 최대 생성 토큰 |
| `PORT` | `3001` | 서버 포트 |
| `VERIFY_GENERATED_PROJECTS` | `false` | 생성된 프로젝트에서 `npm install`, `npm run build`, `npm test`를 실행할지 여부 |
| `VERIFY_TIMEOUT_MS` | `120000` | 생성 프로젝트 검증 명령별 타임아웃 |

## 테스트

```bash
# 전체 테스트
make test

# 커버리지 포함
make test-coverage

# 브라우저 E2E 테스트
npm run test:e2e
```

`npm run test:e2e`는 서버를 먼저 빌드한 뒤 `DEMO_MODE=true`로 서버와 Vite 앱을 띄워 Dashboard/Settings 흐름을 Playwright로 검증합니다.

## 생성 결과 검증

파이프라인은 최종 에이전트 응답을 ZIP에 저장할 때:

- 원본 응답: `final-backend.md`, `final-frontend.md`
- 파일트리: `generated/backend`, `generated/frontend`
- 검증 요약: `SUMMARY.md`

를 포함합니다. 에이전트가 파일별 markdown code block을 반환하면 실제 파일로 펼쳐 저장하고, 그렇지 않으면 fallback 응답 파일로 저장합니다.

기본값에서는 생성된 코드를 실행하지 않고 파일 수와 `package.json` 존재 여부만 요약합니다. 실제 생성 프로젝트에서 `npm install`, `npm run build`, `npm test`까지 실행하려면 서버 환경 변수에 아래 값을 설정하세요.

```env
VERIFY_GENERATED_PROJECTS=true
```

## Docker

```bash
# 프로덕션 이미지 빌드
docker build -t ai-software-team:latest .

# 데모 모드로 실행
docker run --rm -p 3001:3001 \
  -e DEMO_MODE=true \
  -e JWT_SECRET=change-me \
  ai-software-team:latest

# Health check
curl http://localhost:3001/health
```

## 기술 스택

**Backend**
- Node.js 20 + TypeScript 5
- Express 4 (SSE streaming)
- Ollama local-first provider
- Optional Anthropic provider via @anthropic-ai/sdk

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

## Provider 전략

- 기본값은 `LLM_PROVIDER=ollama`입니다. 투자 전/로컬 개발 단계에서 API 비용 없이 실행할 수 있습니다.
- SaaS 운영 전까지는 BYOK(Bring Your Own Key) 또는 local-first 전략을 권장합니다.
- Anthropic은 선택 provider입니다. `LLM_PROVIDER=anthropic`일 때만 `ANTHROPIC_API_KEY`가 필요합니다.
- 로컬 첫 실행은 `npm run smoke:ollama`로 시작하고, 실제 아이디어 검증은 `npm run mvp:ollama:verify`로 이어가는 것을 권장합니다. 전체 7-agent 반복 파이프라인보다 빠르게 모델 연결, 파일 생성, ZIP 패키징, 생성 앱 미리보기까지 확인할 수 있습니다.

## 주의사항

- `claude-opus-4-7`은 현재 존재하지 않습니다. 사용 가능한 최신 Opus 모델(`claude-opus-4-6`)을 사용합니다. `ANTHROPIC_MODEL` 환경변수로 변경 가능합니다.
- Anthropic provider 사용 시 각 에이전트 호출에서 Extended Thinking이 활성화됩니다 (`thinking: { type: "enabled" }`).
- 전체 파이프라인 실행에 상당한 토큰이 사용됩니다 (약 50,000~200,000 토큰). Ollama는 무료지만 로컬 CPU/GPU 시간이 오래 걸릴 수 있습니다.
