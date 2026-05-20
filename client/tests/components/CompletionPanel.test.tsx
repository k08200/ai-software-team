import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { CompletionPanel } from "../../src/components/CompletionPanel.js";
import { usePipelineStore } from "../../src/store/pipeline-store.js";

describe("CompletionPanel", () => {
  beforeEach(() => {
    usePipelineStore.getState().resetPipeline();
  });

  it("highlights app preview as the recommended next step when checks pass", () => {
    usePipelineStore.setState({
      status: "completed",
      profile: "mvp",
      zipReady: true,
      totalTokens: 1000,
      frontendPreviewUrl: "/api/pipeline/app-preview/session/",
      generatedVerificationPassed: true,
      generatedVerification: [
        {
          name: "Frontend",
          relativePath: "generated/frontend",
          fileCount: 5,
          hasPackageJson: true,
          commands: [
            { command: "npm install", status: "passed", durationMs: 100 },
            { command: "npm run build", status: "passed", durationMs: 100 },
          ],
        },
      ],
      startTime: 1000,
      endTime: 2000,
    });

    render(<CompletionPanel />);

    expect(screen.getByText("추천 다음 단계")).toBeInTheDocument();
    expect(screen.getByText("생성된 앱을 바로 확인하세요")).toBeInTheDocument();
    expect(screen.queryByText("빌드 확인 필요")).not.toBeInTheDocument();
  });

  it("surfaces failed build checks before download actions", () => {
    usePipelineStore.setState({
      status: "completed",
      profile: "mvp",
      zipReady: true,
      totalTokens: 1000,
      generatedVerificationPassed: false,
      generatedVerification: [
        {
          name: "Backend",
          relativePath: "generated/backend",
          fileCount: 5,
          hasPackageJson: true,
          commands: [
            { command: "npm install", status: "passed", durationMs: 100 },
            {
              command: "npm run build",
              status: "failed",
              durationMs: 100,
              exitCode: 2,
              output: "src/index.ts: error TS2304: Cannot find name",
            },
          ],
        },
      ],
      startTime: 1000,
      endTime: 2000,
    });

    render(<CompletionPanel />);

    expect(screen.getByText("빌드 확인 필요")).toBeInTheDocument();
    expect(screen.getByText("Backend · npm run build")).toBeInTheDocument();
    expect(screen.getByText(/TS2304/)).toBeInTheDocument();
  });
});

