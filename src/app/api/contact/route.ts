import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, company, bottlenecks, email } = body;

    // 1. Validation checks
    if (!name || !company || !bottlenecks || !email) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address." },
        { status: 400 }
      );
    }

    // Local logging snapshot
    console.log("[Contact Lead]", { name, company, bottlenecks, email });

    // 2. THE AUTOMATION: Beam the lead instantly to your webhook
    // Replace the text inside the quotes below with your actual copied Webhook URL
    const WEBHOOK_URL = "https://discord.com/api/webhooks/1522089547452645507/jrvkzwpSZJjxZZR2OgXF4j-S83wRZaZfjQi6WmG8T9TJAQYVbcpmPJlLA0ANs6nclEsp";

    if (WEBHOOK_URL && !WEBHOOK_URL.startsWith("PASTE_")) {
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "ScaleSystems Lead Sentinel",
          avatar_url: "https://scalesystemsai.vercel.app/icon.tsx", // Uses your actual site icon
          embeds: [
            {
              title: "🚀 New High-Intent B2B Lead Received!",
              color: 16711935, // Neon cyan/purple aura code
              fields: [
                { name: "👤 Client Name", value: name, inline: true },
                { name: "🏢 Company", value: company, inline: true },
                { name: "📧 Work Email", value: email, inline: false },
                { name: "⚠️ Operational Bottlenecks", value: bottlenecks, inline: false },
              ],
              footer: { text: "ScaleSystems Autonomous Capture Engine" },
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Webhook integration error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}