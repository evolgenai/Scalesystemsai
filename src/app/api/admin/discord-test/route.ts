import { NextResponse } from "next/server";

function isDiscordWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.hostname === "discord.com" || u.hostname === "discordapp.com") &&
      u.pathname.includes("/api/webhooks/")
    );
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  let body: { webhookUrl?: string };
  try {
    body = (await req.json()) as { webhookUrl?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const webhookUrl = body.webhookUrl?.trim() ?? "";
  if (!webhookUrl || !isDiscordWebhook(webhookUrl)) {
    return NextResponse.json(
      { error: "Valid Discord webhook URL required." },
      { status: 400 }
    );
  }

  const discordRes = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "ScaleSystems Meta-SRE",
      embeds: [
        {
          title: "📱 Test Mobile Alert",
          description:
            "Structured ping from the Super-Admin Discord Dispatch panel. If you see this on your phone, mobile alerts are wired.",
          color: 0x10b981,
          fields: [
            { name: "Source", value: "Meta-SRE Command Deck", inline: true },
            { name: "Plane", value: "#040907 Obsidian", inline: true },
            {
              name: "Status",
              value: "Webhook reachability OK",
              inline: false,
            },
          ],
          footer: { text: "ScaleSystems · Super-Admin" },
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!discordRes.ok) {
    const detail = await discordRes.text().catch(() => "");
    return NextResponse.json(
      {
        error: `Discord responded ${discordRes.status}`,
        detail: detail.slice(0, 240),
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
