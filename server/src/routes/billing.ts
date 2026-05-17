import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { authRequired } from "../middleware/auth.js";
import {
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  getUsageForPeriod,
  PRICE_IDS,
} from "../services/stripe-service.js";
import { config } from "../config.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const CheckoutSchema = z.object({
  priceId: z.string().min(1, "priceId is required"),
});

// ---------------------------------------------------------------------------
// Plan definitions (public, no auth needed)
// ---------------------------------------------------------------------------

const PLANS = [
  {
    id: "free",
    name: "Free",
    priceUsd: 0,
    runsPerMonth: config.plans.free.runsPerMonth,
    features: [
      `${config.plans.free.runsPerMonth} pipeline runs / month`,
      "All 7 AI agents",
      "Code download",
    ],
    priceId: null,
  },
  {
    id: "starter",
    name: "Starter",
    priceUsd: config.plans.starter.price,
    runsPerMonth: config.plans.starter.runsPerMonth,
    features: [
      `${config.plans.starter.runsPerMonth} pipeline runs / month`,
      "All 7 AI agents",
      "Code download",
      "API key access",
      "Usage dashboard",
    ],
    priceId: PRICE_IDS.starter || null,
  },
  {
    id: "pro",
    name: "Pro",
    priceUsd: config.plans.pro.price,
    runsPerMonth: config.plans.pro.runsPerMonth,
    features: [
      `${config.plans.pro.runsPerMonth} pipeline runs / month`,
      "All 7 AI agents",
      "Code download",
      "API key access",
      "Usage dashboard",
      "Priority queue",
    ],
    priceId: PRICE_IDS.pro || null,
  },
  {
    id: "team",
    name: "Team",
    priceUsd: config.plans.team.price,
    runsPerMonth: config.plans.team.runsPerMonth,
    features: [
      `${config.plans.team.runsPerMonth} pipeline runs / month`,
      "All 7 AI agents",
      "Code download",
      "API key access",
      "Usage dashboard",
      "Priority queue",
      "Team seat management",
    ],
    priceId: PRICE_IDS.team || null,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceUsd: null, // custom pricing
    runsPerMonth: null, // unlimited
    features: [
      "Unlimited pipeline runs",
      "All 7 AI agents",
      "Code download",
      "API key access",
      "Usage dashboard",
      "Priority queue",
      "Team seat management",
      "SSO / SAML",
      "Dedicated support",
      "Custom SLA",
    ],
    priceId: PRICE_IDS.enterprise || null,
  },
] as const;

// ---------------------------------------------------------------------------
// GET /plans  — public
// ---------------------------------------------------------------------------

router.get("/plans", (_req: Request, res: Response): void => {
  res.status(200).json({ success: true, data: { plans: PLANS } });
});

// ---------------------------------------------------------------------------
// POST /checkout  — authRequired
// ---------------------------------------------------------------------------

router.post("/checkout", authRequired, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  const parsed = CheckoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validation failed",
    });
    return;
  }

  // Validate the priceId belongs to a known plan
  const knownPriceIds = Object.values(PRICE_IDS).filter(Boolean);
  if (!knownPriceIds.includes(parsed.data.priceId)) {
    res.status(400).json({ success: false, error: "Unknown price ID." });
    return;
  }

  try {
    const url = await createCheckoutSession(req.user.id, parsed.data.priceId);
    res.status(200).json({ success: true, data: { url } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    console.error("[billing] checkout error:", message);
    res.status(500).json({ success: false, error: "Failed to create checkout session." });
  }
});

// ---------------------------------------------------------------------------
// POST /portal  — authRequired
// ---------------------------------------------------------------------------

router.post("/portal", authRequired, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  try {
    const url = await createPortalSession(req.user.id);
    res.status(200).json({ success: true, data: { url } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Portal session failed";

    if (message.includes("No Stripe customer")) {
      res.status(400).json({
        success: false,
        error: "No billing account found. Please subscribe to a plan first.",
      });
      return;
    }

    console.error("[billing] portal error:", message);
    res.status(500).json({ success: false, error: "Failed to open customer portal." });
  }
});

// ---------------------------------------------------------------------------
// POST /webhook  — raw body, Stripe signature verification
// ---------------------------------------------------------------------------

router.post(
  "/webhook",
  // NOTE: raw body parsing is configured in the Express app for this route.
  // The main index.ts must use express.raw({ type: "application/json" }) for
  // the /api/billing/webhook path BEFORE express.json().
  async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers["stripe-signature"];

    if (typeof signature !== "string" || signature.length === 0) {
      res.status(400).json({ success: false, error: "Missing Stripe signature." });
      return;
    }

    const rawBody: Buffer = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      res.status(400).json({
        success: false,
        error: "Webhook must use raw body. Ensure express.raw() is applied to this route.",
      });
      return;
    }

    try {
      await handleWebhook(rawBody, signature);
      res.status(200).json({ received: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Webhook processing failed";

      if (message.includes("signature verification failed")) {
        console.warn("[billing] webhook signature mismatch:", message);
        res.status(400).json({ success: false, error: "Invalid webhook signature." });
        return;
      }

      console.error("[billing] webhook error:", message);
      res.status(500).json({ success: false, error: "Webhook processing failed." });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /usage  — authRequired
// ---------------------------------------------------------------------------

router.get("/usage", authRequired, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return;
  }

  try {
    const usage = await getUsageForPeriod(req.user.id);
    res.status(200).json({ success: true, data: { usage } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch usage";
    console.error("[billing] usage error:", message);
    res.status(500).json({ success: false, error: "Failed to retrieve usage data." });
  }
});

export default router;
