import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { TokenCounter } from "../../src/components/TokenCounter.js";
import { usePipelineStore } from "../../src/store/pipeline-store.js";

describe("TokenCounter", () => {
  beforeEach(() => {
    usePipelineStore.setState({ totalTokens: 0, status: "idle" });
  });

  it("displays zero tokens initially", () => {
    render(<TokenCounter />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("displays formatted token count", () => {
    usePipelineStore.setState({ totalTokens: 1234567 });
    render(<TokenCounter />);
    expect(screen.getByText("1,234,567")).toBeInTheDocument();
  });

  it("shows live counting indicator when running", () => {
    usePipelineStore.setState({ status: "running", totalTokens: 500 });
    render(<TokenCounter />);
    expect(screen.getByText(/live counting/i)).toBeInTheDocument();
  });

  it("does not show live indicator when idle", () => {
    usePipelineStore.setState({ status: "idle" });
    render(<TokenCounter />);
    expect(screen.queryByText(/live counting/i)).not.toBeInTheDocument();
  });
});
