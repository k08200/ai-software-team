import {
  useState,
  useEffect,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  User as UserIcon,
  Key,
  CreditCard,
  AlertTriangle,
  Copy,
  Check,
  Trash2,
  Plus,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth.js";
import { api, apiClient } from "../services/api.js";
import type { ApiKey, BillingPlan } from "../types/auth.js";
import { Button } from "../components/ui/Button.js";
import { Input } from "../components/ui/Input.js";
import { Modal } from "../components/ui/Modal.js";
import { PlanBadge } from "../components/ui/Badge.js";

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type Tab = "profile" | "api-keys" | "billing" | "danger";

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "profile", label: "Profile", icon: <UserIcon size={14} /> },
  { id: "api-keys", label: "API Keys", icon: <Key size={14} /> },
  { id: "billing", label: "Billing", icon: <CreditCard size={14} /> },
  { id: "danger", label: "Danger Zone", icon: <AlertTriangle size={14} /> },
];

// ---------------------------------------------------------------------------
// Profile tab
// ---------------------------------------------------------------------------

function ProfileTab() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!currentPassword) return setError("Enter your current password");
    if (newPassword.length < 8) return setError("New password must be at least 8 characters");
    if (newPassword !== confirmNewPassword) return setError("Passwords do not match");

    setIsLoading(true);
    try {
      await apiClient.post("/auth/change-password", { currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-lg">
      {/* Account info */}
      <section>
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Account Information</h3>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Email</span>
            <span className="text-sm text-white">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Plan</span>
            {user && <PlanBadge plan={user.plan} />}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Account ID</span>
            <span className="font-mono text-xs text-gray-400">{user?.id}</span>
          </div>
        </div>
      </section>

      {/* Change password */}
      <section>
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Change Password</h3>

        {success && (
          <div className="mb-4 px-4 py-3 bg-green-900/30 border border-green-800 rounded-xl text-sm text-green-400">
            Password changed successfully.
          </div>
        )}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-800 rounded-xl text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 characters"
            autoComplete="new-password"
          />
          <Input
            label="Confirm New Password"
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            placeholder="Re-enter new password"
            autoComplete="new-password"
          />
          <Button type="submit" variant="secondary" isLoading={isLoading}>
            Update Password
          </Button>
        </form>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API Keys tab
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-gray-700"
      aria-label={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create key modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // Revoke confirm modal
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  useEffect(() => {
    api.keys
      .list()
      .then((data) => setKeys(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return setCreateError("Key name is required");

    setIsCreating(true);
    setCreateError(null);
    try {
      const { key, apiKey } = await api.keys.create(newKeyName.trim());
      setCreatedKey(key);
      setKeys((prev) => [apiKey, ...prev]);
      setNewKeyName("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    try {
      await api.keys.revoke(revokeTarget.id);
      setKeys((prev) => prev.filter((k) => k.id !== revokeTarget.id));
      setRevokeTarget(null);
    } catch {
      // Silently handle; user can retry
    } finally {
      setIsRevoking(false);
    }
  };

  const handleCloseCreate = () => {
    setShowCreateModal(false);
    setCreatedKey(null);
    setNewKeyName("");
    setCreateError(null);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-300">API Keys</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Use these keys to authenticate programmatic access to the API.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={14} />
          Create Key
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
          Loading keys…
        </div>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : keys.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <Key size={24} className="text-gray-700 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No API keys yet</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm" aria-label="API Keys">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Key</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Last Used</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {keys.map((key) => (
                <tr key={key.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3.5 text-gray-300 font-medium">{key.name}</td>
                  <td className="px-4 py-3.5">
                    <code className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded font-mono">
                      {key.prefix}••••••••
                    </code>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(key.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => setRevokeTarget(key)}
                      className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded"
                      aria-label={`Revoke ${key.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Key Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={handleCloseCreate}
        title="Create API Key"
        size="sm"
      >
        {createdKey ? (
          <div className="space-y-4">
            <div className="bg-green-900/20 border border-green-800 rounded-xl p-4">
              <p className="text-xs text-green-400 mb-2 font-medium">
                Save this key — it will only be shown once.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-white bg-gray-800 px-3 py-2 rounded-lg font-mono break-all">
                  {createdKey}
                </code>
                <CopyButton text={createdKey} />
              </div>
            </div>
            <Button variant="secondary" size="md" onClick={handleCloseCreate} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <Input
              label="Key Name"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Production, CI/CD"
              error={createError ?? undefined}
              autoFocus
            />
            <div className="flex gap-3">
              <Button type="button" variant="ghost" size="md" onClick={handleCloseCreate} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" isLoading={isCreating} className="flex-1">
                Create
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Revoke Confirm Modal */}
      <Modal
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="Revoke API Key"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            Are you sure you want to revoke{" "}
            <span className="font-semibold text-white">
              {revokeTarget?.name}
            </span>
            ? This action cannot be undone and any apps using this key will
            stop working.
          </p>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              size="md"
              onClick={() => setRevokeTarget(null)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              isLoading={isRevoking}
              onClick={handleRevoke}
              className="flex-1"
            >
              Revoke Key
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing tab
// ---------------------------------------------------------------------------

const PLAN_HIGHLIGHTS: Record<string, string[]> = {
  free: ["10 runs/month", "Community support", "Basic models"],
  starter: ["50 runs/month", "Email support", "All models"],
  pro: ["500 runs/month", "Priority support", "Extended thinking"],
  team: ["2000 runs/month", "Slack support", "Custom agents"],
  enterprise: ["Unlimited runs", "Dedicated support", "SLA + SSO"],
};

const PLAN_PRICES: Record<string, number> = {
  free: 0,
  starter: 9,
  pro: 29,
  team: 99,
  enterprise: 499,
};

function BillingTab() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState<string | null>(null);
  const [isManaging, setIsManaging] = useState(false);

  useEffect(() => {
    api.billing
      .plans()
      .then((data) => setPlans(data))
      .catch(() => {
        // Use fallback plan list
        setPlans(
          (["free", "starter", "pro", "team", "enterprise"] as const).map(
            (id) => ({
              id,
              name: id.charAt(0).toUpperCase() + id.slice(1),
              price: PLAN_PRICES[id],
              runsPerMonth: { free: 10, starter: 50, pro: 500, team: 2000, enterprise: -1 }[id],
              features: PLAN_HIGHLIGHTS[id],
            }),
          ),
        );
      })
      .finally(() => setIsLoadingPlans(false));
  }, []);

  const handleCheckout = async (planId: string) => {
    setIsCheckingOut(planId);
    try {
      const { url } = await api.billing.checkout(planId);
      window.location.href = url;
    } catch {
      setIsCheckingOut(null);
    }
  };

  const handleManage = async () => {
    setIsManaging(true);
    try {
      const { url } = await api.billing.manageSubscription();
      window.open(url, "_blank", "noopener");
    } catch {
      // Silently handle
    } finally {
      setIsManaging(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Current plan */}
      <section>
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Current Plan</h3>
        {user && (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <PlanBadge plan={user.plan} />
                <span className="text-white font-semibold capitalize">{user.plan} Plan</span>
              </div>
              <p className="text-xs text-gray-400">
                {user.runsThisMonth} of{" "}
                {user.runsLimit === -1 ? "unlimited" : user.runsLimit} runs used
                this month
              </p>
            </div>
            {user.plan !== "free" && (
              <Button
                variant="secondary"
                size="sm"
                isLoading={isManaging}
                onClick={handleManage}
              >
                <ExternalLink size={12} />
                Manage Subscription
              </Button>
            )}
          </div>
        )}
      </section>

      {/* Plan cards */}
      <section>
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Available Plans</h3>
        {isLoadingPlans ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            Loading plans…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent = user?.plan === plan.id;
              const isPopular = plan.id === "pro";

              return (
                <div
                  key={plan.id}
                  className={[
                    "bg-gray-900 border rounded-2xl p-5 flex flex-col gap-4 relative",
                    isPopular
                      ? "border-purple-600/70 shadow-lg shadow-purple-900/20"
                      : "border-gray-800",
                  ].join(" ")}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-full">
                        MOST POPULAR
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-white capitalize">
                      {plan.name}
                    </p>
                    <div className="flex items-end gap-1 mt-1">
                      <span className="text-2xl font-bold text-white">
                        ${plan.price}
                      </span>
                      <span className="text-xs text-gray-500 mb-1">/mo</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {plan.runsPerMonth === -1
                        ? "Unlimited"
                        : plan.runsPerMonth.toLocaleString()}{" "}
                      runs/month
                    </p>
                  </div>

                  <ul className="space-y-1.5 flex-1">
                    {(plan.features ?? PLAN_HIGHLIGHTS[plan.id] ?? []).map(
                      (f) => (
                        <li key={f} className="flex items-center gap-2 text-xs text-gray-400">
                          <Check size={11} className="text-green-500 flex-shrink-0" />
                          {f}
                        </li>
                      ),
                    )}
                  </ul>

                  <Button
                    variant={isCurrent ? "ghost" : "primary"}
                    size="sm"
                    disabled={isCurrent}
                    isLoading={isCheckingOut === plan.id}
                    onClick={() => !isCurrent && handleCheckout(plan.id)}
                    className="w-full"
                  >
                    {isCurrent ? "Current Plan" : `Upgrade to ${plan.name}`}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danger Zone tab
// ---------------------------------------------------------------------------

function DangerTab() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const REQUIRED_TEXT = "delete my account";

  const handleDelete = async () => {
    if (confirmText !== REQUIRED_TEXT) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await apiClient.delete(`/users/${user?.id}`);
      logout();
      navigate("/", { replace: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account");
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div className="bg-red-950/20 border border-red-900/50 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-400 mb-1">
              Delete Account
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              This will permanently delete your account, all your runs, API keys,
              and billing information. This action cannot be undone.
            </p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowConfirm(true)}
            >
              <Trash2 size={13} />
              Delete Account
            </Button>
          </div>
        </div>
      </div>

      {/* Confirm deletion modal */}
      <Modal
        isOpen={showConfirm}
        onClose={() => {
          setShowConfirm(false);
          setConfirmText("");
          setDeleteError(null);
        }}
        title="Delete Account"
        size="sm"
        disableBackdropClose
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            This will permanently delete all your data. To confirm, type{" "}
            <code className="text-red-400 bg-gray-800 px-1.5 py-0.5 rounded text-xs">
              {REQUIRED_TEXT}
            </code>{" "}
            below:
          </p>

          {deleteError && (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 px-3 py-2 rounded-lg">
              {deleteError}
            </p>
          )}

          <Input
            label=""
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={REQUIRED_TEXT}
            autoFocus
          />
          <div className="flex gap-3">
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setShowConfirm(false);
                setConfirmText("");
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              disabled={confirmText !== REQUIRED_TEXT}
              isLoading={isDeleting}
              onClick={handleDelete}
              className="flex-1"
            >
              Delete Forever
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings page shell
// ---------------------------------------------------------------------------

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as Tab) ?? "profile";

  const setTab = (tab: Tab) => setSearchParams({ tab });

  const tabContent: Record<Tab, ReactNode> = {
    profile: <ProfileTab />,
    "api-keys": <ApiKeysTab />,
    billing: <BillingTab />,
    danger: <DangerTab />,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">
          Manage your account, keys, and billing
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar tabs */}
        <nav
          className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible md:w-44 flex-shrink-0"
          aria-label="Settings navigation"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={[
                "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap text-left w-full",
                activeTab === tab.id
                  ? "bg-purple-900/40 text-purple-300 border border-purple-800/50"
                  : "text-gray-400 hover:text-white hover:bg-gray-800",
                tab.id === "danger" && activeTab !== "danger"
                  ? "hover:text-red-400"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              <span
                className={
                  tab.id === "danger" && activeTab !== "danger"
                    ? "text-red-600"
                    : ""
                }
              >
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">{tabContent[activeTab]}</div>
      </div>
    </div>
  );
}

export default SettingsPage;
