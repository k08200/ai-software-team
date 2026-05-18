import { Link } from "react-router-dom";
import {
  Zap,
  ArrowRight,
  Check,
  Github,
  Shield,
  Code2,
  Users,
} from "lucide-react";
import { Button } from "../components/ui/Button.js";

const FEATURES = [
  {
    icon: <Zap size={20} className="text-purple-400" />,
    title: "7 Specialist AI Agents",
    description:
      "CTO, PM, Backend, Frontend, QA, Security, and Review agents collaborate in sequence to build your product.",
  },
  {
    icon: <Code2 size={20} className="text-cyan-400" />,
    title: "Production-Ready Code",
    description:
      "Receive a fully structured, downloadable ZIP with frontend, backend, tests, and documentation.",
  },
  {
    icon: <Shield size={20} className="text-green-400" />,
    title: "Built-in Quality Loops",
    description:
      "QA and Security agents review output and trigger iterative fix rounds until issues are resolved.",
  },
  {
    icon: <Users size={20} className="text-yellow-400" />,
    title: "Extended Thinking",
    description:
      "Powered by Claude with extended thinking — agents reason deeply before writing a single line.",
  },
];

const HOW_IT_WORKS = [
  { step: "01", label: "Describe Your Idea", desc: "One sentence is enough." },
  { step: "02", label: "Agents Collaborate", desc: "7 AI agents work in a pipeline." },
  { step: "03", label: "Review & Download", desc: "Get your production ZIP." },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
              <Zap size={13} className="text-white" />
            </div>
            <span className="font-bold text-sm text-white">AI Software Team</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="GitHub"
            >
              <Github size={18} />
            </a>
            <Link
              to="/login"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link to="/register">
              <Button variant="primary" size="sm">
                Get Started Free
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 text-center">
        <div className="inline-flex items-center gap-2 text-xs text-purple-400 bg-purple-900/20 border border-purple-800/40 px-3 py-1.5 rounded-full mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse inline-block" />
          Powered by Claude with Extended Thinking
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight leading-tight max-w-3xl mx-auto">
          One Idea.{" "}
          <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
            Seven AI Agents.
          </span>{" "}
          Complete Software.
        </h1>

        <p className="text-gray-400 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
          Describe your product in one sentence. Our AI engineering team handles
          architecture, code, tests, and security — delivering a production-ready
          ZIP you can deploy immediately.
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link to="/register">
            <Button variant="primary" size="lg">
              Start Building Free
              <ArrowRight size={16} />
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary" size="lg">
              Sign in
            </Button>
          </Link>
        </div>

        <p className="text-xs text-gray-600 mt-4">
          10 free runs per month. No credit card required.
        </p>
      </section>

      {/* Agent pipeline visual */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8">
          <p className="text-xs text-gray-500 text-center uppercase tracking-widest mb-6">
            Agent Pipeline
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { emoji: "🏗️", name: "CTO", color: "#6366f1" },
              { emoji: "📋", name: "PM", color: "#8b5cf6" },
              { emoji: "⚙️", name: "Backend", color: "#06b6d4" },
              { emoji: "🎨", name: "Frontend", color: "#10b981" },
              { emoji: "🧪", name: "QA", color: "#f59e0b" },
              { emoji: "🔒", name: "Security", color: "#ef4444" },
              { emoji: "👁️", name: "Review", color: "#3b82f6" },
            ].map((agent, i, arr) => (
              <div key={agent.name} className="flex items-center gap-2">
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm"
                  style={{
                    borderColor: `${agent.color}40`,
                    backgroundColor: `${agent.color}15`,
                  }}
                >
                  <span>{agent.emoji}</span>
                  <span className="text-gray-300 text-xs font-medium">{agent.name}</span>
                </div>
                {i < arr.length - 1 && (
                  <ArrowRight size={12} className="text-gray-700 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <h2 className="text-2xl font-bold text-white text-center mb-10">
          How It Works
        </h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map((item) => (
            <div
              key={item.step}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center"
            >
              <div className="text-3xl font-black text-purple-800 mb-3">
                {item.step}
              </div>
              <h3 className="text-sm font-semibold text-white mb-1.5">
                {item.label}
              </h3>
              <p className="text-xs text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <h2 className="text-2xl font-bold text-white text-center mb-10">
          Everything You Need
        </h2>
        <div className="grid sm:grid-cols-2 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex gap-4"
            >
              <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0">
                {f.icon}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">{f.title}</h3>
                <p className="text-xs text-gray-400 leading-relaxed">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Plans summary */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <div className="bg-gradient-to-br from-purple-950/40 to-indigo-950/40 border border-purple-800/30 rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold text-white mb-2">
            Simple, Transparent Pricing
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            Start free, upgrade when you need more runs.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            {[
              { plan: "Free", price: "$0", runs: "3/mo" },
              { plan: "Starter", price: "$29", runs: "30/mo" },
              { plan: "Pro", price: "$99", runs: "150/mo", popular: true },
              { plan: "Team", price: "$299", runs: "500/mo" },
            ].map((p) => (
              <div
                key={p.plan}
                className={[
                  "px-5 py-3.5 rounded-xl border text-sm min-w-[120px]",
                  p.popular
                    ? "border-purple-600 bg-purple-900/30"
                    : "border-gray-700 bg-gray-900",
                ].join(" ")}
              >
                {p.popular && (
                  <p className="text-[10px] text-purple-400 font-bold mb-1">POPULAR</p>
                )}
                <p className="font-semibold text-white">{p.plan}</p>
                <p className="text-gray-400 text-xs mt-0.5">{p.price}/mo</p>
                <p className="text-gray-500 text-xs">{p.runs} runs</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-6 text-xs text-gray-500 flex-wrap">
            {[
              "No credit card required",
              "Cancel anytime",
              "Instant access",
            ].map((item) => (
              <span key={item} className="flex items-center gap-1.5">
                <Check size={11} className="text-green-500" />
                {item}
              </span>
            ))}
          </div>
          <div className="mt-8">
            <Link to="/register">
              <Button variant="primary" size="lg">
                Get Started Free
                <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 px-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <Zap size={12} className="text-purple-600" />
            <span>AI Software Team</span>
          </div>
          <div className="flex gap-4">
            <Link to="/login" className="hover:text-gray-400 transition-colors">
              Sign in
            </Link>
            <Link to="/register" className="hover:text-gray-400 transition-colors">
              Register
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-400 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
