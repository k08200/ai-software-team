import type { AgentId, PipelineProfile } from "../types/index.js";

export const PROFILE_DETAILS: Record<PipelineProfile, {
  label: string;
  description: string;
  completionTitle: string;
  completionSummary: string;
  skippedRoundsSummary: string;
  agentOrder: AgentId[];
}> = {
  mvp: {
    label: "MVP",
    description: "아이디어 맞춤 앱, 로컬 추천",
    completionTitle: "MVP 생성 완료",
    completionSummary: "생성 앱 미리보기와 ZIP을 확인해 바로 아이디어 검증을 이어갈 수 있습니다.",
    skippedRoundsSummary: "MVP 프로필은 빠른 로컬 생성을 위해 리뷰 라운드를 건너뛰고 빌드 검증을 우선합니다.",
    agentOrder: ["cto", "pm", "backend", "frontend"],
  },
  smoke: {
    label: "Smoke",
    description: "연결/ZIP 빠른 확인",
    completionTitle: "Smoke 검증 완료",
    completionSummary: "모델 연결, 파일 생성, ZIP 패키징 흐름이 정상적으로 끝났습니다.",
    skippedRoundsSummary: "Smoke 프로필은 연결 확인용이라 리뷰 라운드를 실행하지 않습니다.",
    agentOrder: ["cto", "pm", "backend", "frontend"],
  },
  full: {
    label: "Full",
    description: "전체 리뷰 라운드",
    completionTitle: "프로젝트 생성 완료",
    completionSummary: "전체 에이전트 리뷰 라운드까지 반영한 결과입니다.",
    skippedRoundsSummary: "QA/Security/Review 라운드를 기다리는 중입니다.",
    agentOrder: ["cto", "pm", "backend", "frontend", "qa", "security", "review"],
  },
};

