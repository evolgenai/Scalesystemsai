import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatPlanLabel, parsePlanTier } from "@/lib/plans";

const contactSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Full name is required.")
    .max(120, "Full name is too long."),
  email: z.email("Invalid email address."),
  planTier: z
    .enum(["free", "starter", "premium", "enterprise"])
    .optional(),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters.")
    .max(4000, "Message is too long."),
});

type ContactPayload = z.infer<typeof contactSchema>;

function resolveDiscordWebhookUrl(): string | null {
  const url = process.env.DISCORD_SUPPORT_WEBHOOK_URL?.trim();
  if (!url || url.includes("your_") || url.startsWith("PASTE_")) {
    return null;
  }
  return url;
}

async function pushToDiscord(payload: ContactPayload): Promise<void> {
  const webhookUrl = resolveDiscordWebhookUrl();

  if (!webhookUrl) {
    throw new Error("DISCORD_SUPPORT_WEBHOOK_URL is not configured.");
  }

  const planLabel = payload.planTier
    ? formatPlanLabel(parsePlanTier(payload.planTier))
    : "Not specified";

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "ScaleSystems Lead Sentinel",
      embeds: [
        {
          title: "New contact form submission",
          color: 0x00f2fe,
          fields: [
            { name: "Name", value: payload.fullName, inline: true },
            { name: "Email", value: payload.email, inline: true },
            { name: "Plan interest", value: planLabel, inline: false },
            { name: "Message", value: payload.message, inline: false },
          ],
          footer: { text: "ScaleSystems /contact gateway" },
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Discord webhook returned ${response.status}${body ? `: ${body.slice(0, 200)}` : "."}`
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON payload.", code: "INVALID_JSON" },
        { status: 400 }
      );
    }

    const parsed = contactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed.",
          code: "VALIDATION_ERROR",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    await pushToDiscord(parsed.data);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[Contact API] Webhook delivery failed:", error);

    const message =
      error instanceof Error ? error.message : "Internal server error.";

    if (message.includes("DISCORD_SUPPORT_WEBHOOK_URL")) {
      return NextResponse.json(
        {
          success: false,
          error: message,
          code: "WEBHOOK_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Unable to deliver contact submission.",
        code: "WEBHOOK_DELIVERY_FAILED",
      },
      { status: 502 }
    );
  }
}
