import { useState, type FormEvent } from "react";
import { usePipelineStore } from "../store/pipeline-store.js";
import { usePipeline } from "../hooks/usePipeline.js";
import type { PipelineProfile } from "../types/index.js";
import { PROFILE_DETAILS } from "../utils/pipeline-profile.js";

const EXAMPLES = [
  "할 일 앱 만들어줘",
  "실시간 채팅 앱 만들어줘",
  "AI 기반 레시피 추천 서비스",
  "URL 단축 서비스",
  "개인 블로그 플랫폼",
];

const PROFILE_OPTIONS: Array<{
  id: PipelineProfile;
  label: string;
  description: string;
}> = [
  {
    id: "mvp",
    label: PROFILE_DETAILS.mvp.label,
    description: PROFILE_DETAILS.mvp.description,
  },
  {
    id: "smoke",
    label: PROFILE_DETAILS.smoke.label,
    description: PROFILE_DETAILS.smoke.description,
  },
  {
    id: "full",
    label: PROFILE_DETAILS.full.label,
    description: PROFILE_DETAILS.full.description,
  },
];

export function IdeaInput() {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const { run, cancel } = usePipeline();
  const status = usePipelineStore((s) => s.status);
  const profile = usePipelineStore((s) => s.profile);
  const setProjectIdea = usePipelineStore((s) => s.setProjectIdea);
  const setProfile = usePipelineStore((s) => s.setProfile);

  const isRunning = status === "running";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const idea = input.trim();

    if (!idea) {
      setError("제품 아이디어를 입력해주세요.");
      return;
    }
    if (idea.length < 5) {
      setError("최소 5자 이상 입력해주세요.");
      return;
    }

    setError("");
    setProjectIdea(idea);
    await run(idea);
  };

  const handleExample = (example: string) => {
    setInput(example);
    setError("");
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError("");
            }}
            placeholder="제품 아이디어를 한 문장으로 입력하세요... (예: 할 일 앱 만들어줘)"
            rows={3}
            maxLength={1000}
            disabled={isRunning}
            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Product idea input"
            aria-invalid={!!error}
            aria-describedby={error ? "input-error" : undefined}
          />
          <div className="absolute bottom-2 right-3 text-xs text-gray-600">
            {input.length}/1000
          </div>
        </div>

        {error && (
          <p id="input-error" className="text-red-400 text-xs" role="alert">
            {error}
          </p>
        )}

        {!isRunning && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Pipeline profile">
            {PROFILE_OPTIONS.map((option) => {
              const selected = profile === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setProfile(option.id)}
                  className={[
                    "min-h-[72px] rounded-xl border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-cyan-500 bg-cyan-500/10 text-white"
                      : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500 hover:bg-gray-700/60",
                  ].join(" ")}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-gray-500">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Example chips */}
        {!isRunning && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-gray-500">예시:</span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleExample(example)}
                className="text-xs text-gray-400 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 px-3 py-1 rounded-full transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          {!isRunning ? (
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isRunning}
            >
              🚀 AI팀 시작하기
            </button>
          ) : (
            <button
              type="button"
              onClick={cancel}
              className="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 font-semibold py-3 px-6 rounded-xl transition-all duration-200"
            >
              ✕ 중단하기
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
