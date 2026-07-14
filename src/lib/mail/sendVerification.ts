/**
 * Stub email verification sender.
 * Logs to console in development; swap for Resend/SendGrid when configured.
 */

export type VerificationMailPayload = {
  to: string;
  code: string;
  purpose: "signup" | "reset";
};

export async function sendVerificationEmail(
  payload: VerificationMailPayload
): Promise<{ sent: boolean; provider: "stub" | "resend" }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (apiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:
            process.env.MAIL_FROM?.trim() ||
            "ScaleSystems <noreply@scalesystems.ai>",
          to: payload.to,
          subject:
            payload.purpose === "reset"
              ? "Your ScaleSystems password reset code"
              : "Your ScaleSystems email verification code",
          text: `Your verification code is ${payload.code}. It expires in 15 minutes.`,
        }),
      });
      if (response.ok) return { sent: true, provider: "resend" };
    } catch (error) {
      console.error("[mail] Resend send failed", error);
    }
  }

  console.info(
    `[mail:stub] ${payload.purpose} code for ${payload.to}: ${payload.code}`
  );
  return { sent: true, provider: "stub" };
}
