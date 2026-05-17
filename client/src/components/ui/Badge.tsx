import type { HTMLAttributes } from "react";
import type { Plan } from "../../types/auth.js";

type Variant = "default" | "success" | "warning" | "danger" | "info" | "purple";
type Size = "sm" | "md";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  default: "bg-gray-800 text-gray-300 border border-gray-700",
  success: "bg-green-900/40 text-green-400 border border-green-800/50",
  warning: "bg-yellow-900/40 text-yellow-400 border border-yellow-800/50",
  danger: "bg-red-900/40 text-red-400 border border-red-800/50",
  info: "bg-blue-900/40 text-blue-400 border border-blue-800/50",
  purple: "bg-purple-900/40 text-purple-300 border border-purple-800/50",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
};

export function Badge({
  variant = "default",
  size = "sm",
  children,
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full font-medium",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Convenience: plan-specific badge
// ---------------------------------------------------------------------------

const planConfig: Record<Plan, { label: string; variant: Variant }> = {
  free: { label: "Free", variant: "default" },
  starter: { label: "Starter", variant: "info" },
  pro: { label: "Pro", variant: "purple" },
  team: { label: "Team", variant: "success" },
  enterprise: { label: "Enterprise", variant: "warning" },
};

export function PlanBadge({ plan }: { plan: Plan }) {
  const { label, variant } = planConfig[plan];
  return <Badge variant={variant}>{label}</Badge>;
}
