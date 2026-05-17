import Stripe from "stripe";
import { eq, and, gte, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, usageEvents, stripeEvents } from "../db/schema.js";
import { config } from "../config.js";
import type { Plan } from "../db/schema.js";

// Type aliases for Stripe objects — accessed through the Stripe class namespace
type StripeEvent = ReturnType<InstanceType<typeof Stripe>["webhooks"]["constructEvent"]>;
type StripeSubscription = Awaited<ReturnType<InstanceType<typeof Stripe>["subscriptions"]["retrieve"]>>;
type StripeInvoice = Awaited<ReturnType<InstanceType<typeof Stripe>["invoices"]["retrieve"]>>;

// ---------------------------------------------------------------------------
// Stripe client
// ---------------------------------------------------------------------------

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: "2026-04-22.dahlia",
});

// ---------------------------------------------------------------------------
// Price ID constants (sourced from env via config)
// ---------------------------------------------------------------------------

export const PRICE_IDS = {
  starter: config.stripe.prices.starter,
  pro: config.stripe.prices.pro,
  team: config.stripe.prices.team,
  enterprise: config.stripe.prices.enterprise,
} as const;

// ---------------------------------------------------------------------------
// Reverse lookup: priceId → plan name
// ---------------------------------------------------------------------------

function planFromPriceId(priceId: string): Plan | null {
  for (const [plan, id] of Object.entries(PRICE_IDS)) {
    if (id === priceId) return plan as Plan;
  }
  return null;
}

// ---------------------------------------------------------------------------
// createCustomer
// ---------------------------------------------------------------------------

export async function createCustomer(
  email: string,
  userId: string
): Promise<string> {
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  await db
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(users.id, userId));

  return customer.id;
}

// ---------------------------------------------------------------------------
// createCheckoutSession
// ---------------------------------------------------------------------------

export async function createCheckoutSession(
  userId: string,
  priceId: string
): Promise<string> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      stripeCustomerId: users.stripeCustomerId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Ensure customer exists in Stripe
  const customerId =
    user.stripeCustomerId ?? (await createCustomer(user.email, userId));

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${config.clientOrigin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.clientOrigin}/billing/cancelled`,
    metadata: { userId },
    subscription_data: {
      metadata: { userId },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return session.url;
}

// ---------------------------------------------------------------------------
// createPortalSession
// ---------------------------------------------------------------------------

export async function createPortalSession(userId: string): Promise<string> {
  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.stripeCustomerId) {
    throw new Error("No Stripe customer found for this user.");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${config.clientOrigin}/billing`,
  });

  return session.url;
}

// ---------------------------------------------------------------------------
// cancelSubscription
// ---------------------------------------------------------------------------

export async function cancelSubscription(
  subscriptionId: string
): Promise<void> {
  await stripe.subscriptions.cancel(subscriptionId);
}

// ---------------------------------------------------------------------------
// getUsageForPeriod
// ---------------------------------------------------------------------------

export interface UsageSummary {
  runs: number;
  tokens: number;
  costUsd: number;
  billingPeriod: string;
}

export async function getUsageForPeriod(userId: string): Promise<UsageSummary> {
  const now = new Date();
  const billingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const events = await db
    .select({
      eventType: usageEvents.eventType,
      totalTokens: usageEvents.totalTokens,
      costUsd: usageEvents.costUsd,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.createdAt, periodStart),
        lte(usageEvents.createdAt, periodEnd)
      )
    );

  const runs = events.filter((e) => e.eventType === "pipeline_run").length;
  const tokens = events.reduce((sum, e) => sum + e.totalTokens, 0);
  const costUsd = events.reduce((sum, e) => sum + e.costUsd, 0);

  return { runs, tokens, costUsd: Math.round(costUsd * 100) / 100, billingPeriod };
}

// ---------------------------------------------------------------------------
// handleWebhook
// ---------------------------------------------------------------------------

export async function handleWebhook(
  rawBody: Buffer,
  signature: string
): Promise<void> {
  let event: StripeEvent;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.stripe.webhookSecret
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signature verification failed";
    throw new Error(`Webhook signature verification failed: ${message}`);
  }

  // Idempotency check: have we already processed this event?
  const existing = await db
    .select({ id: stripeEvents.id, status: stripeEvents.status })
    .from(stripeEvents)
    .where(eq(stripeEvents.stripeEventId, event.id))
    .limit(1);

  if (existing.length > 0 && existing[0]?.status === "processed") {
    // Already processed — safe to return 200 to Stripe
    return;
  }

  // Insert or update the event record as "pending"
  const [eventRecord] = await db
    .insert(stripeEvents)
    .values({
      stripeEventId: event.id,
      eventType: event.type,
      status: "pending",
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: stripeEvents.stripeEventId,
      set: {
        status: "pending",
        errorMessage: null,
      },
    })
    .returning({ id: stripeEvents.id });

  if (!eventRecord) {
    throw new Error("Failed to persist Stripe event record.");
  }

  try {
    await processStripeEvent(event);

    await db
      .update(stripeEvents)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(stripeEvents.id, eventRecord.id));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db
      .update(stripeEvents)
      .set({ status: "failed", errorMessage })
      .where(eq(stripeEvents.id, eventRecord.id));
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Internal event processor
// ---------------------------------------------------------------------------

async function processStripeEvent(event: StripeEvent): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as StripeSubscription;
      await handleSubscriptionChange(subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as StripeSubscription;
      await handleSubscriptionDeleted(subscription);
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as StripeInvoice;
      await handleInvoicePaid(invoice);
      break;
    }
    default:
      // Unhandled event type — log and ignore
      console.log(`[stripe-service] Unhandled event type: ${event.type}`);
  }
}

async function handleSubscriptionChange(
  subscription: StripeSubscription
): Promise<void> {
  const userId = subscription.metadata["userId"];
  if (!userId) {
    console.warn("[stripe-service] Subscription missing userId metadata:", subscription.id);
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) {
    console.warn("[stripe-service] Subscription has no price item:", subscription.id);
    return;
  }

  const plan = planFromPriceId(priceId) ?? "free";

  await db
    .update(users)
    .set({ plan, stripeSubscriptionId: subscription.id })
    .where(eq(users.id, userId));
}

async function handleSubscriptionDeleted(
  subscription: StripeSubscription
): Promise<void> {
  const userId = subscription.metadata["userId"];
  if (!userId) {
    console.warn("[stripe-service] Deleted subscription missing userId metadata:", subscription.id);
    return;
  }

  await db
    .update(users)
    .set({ plan: "free", stripeSubscriptionId: null })
    .where(eq(users.id, userId));
}

async function handleInvoicePaid(invoice: StripeInvoice): Promise<void> {
  // Invoice paid confirms subscription is active — we can record a billing event
  // or refresh the customer's subscription details if needed.
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

  if (!customerId) return;

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  if (!user) {
    console.warn("[stripe-service] invoice.paid: no user found for customer:", customerId);
    return;
  }

  // Retrieve the subscription to get the latest plan
  const rawSubscription = invoice.parent?.subscription_details?.subscription;
  const subscriptionId =
    typeof rawSubscription === "string" ? rawSubscription : rawSubscription?.id;

  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await handleSubscriptionChange(subscription);
}
