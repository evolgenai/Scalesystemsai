/**
 * Stub SMS dispatch helper for dual-channel verification.
 * Logs to console unless TWILIO_* env vars are configured.
 */

export type SmsPayload = {
  to: string;
  code: string;
  purpose: "signup" | "reset";
};

export async function sendVerificationSms(
  payload: SmsPayload
): Promise<{ sent: boolean; provider: "stub" | "twilio" }> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();

  if (sid && token && from) {
    try {
      const auth = Buffer.from(`${sid}:${token}`).toString("base64");
      const body = new URLSearchParams({
        To: payload.to,
        From: from,
        Body: `ScaleSystems ${payload.purpose} code: ${payload.code}`,
      });
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        }
      );
      if (response.ok) return { sent: true, provider: "twilio" };
    } catch (error) {
      console.error("[sms] Twilio send failed", error);
    }
  }

  console.info(
    `[sms:stub] ${payload.purpose} code for ${payload.to}: ${payload.code}`
  );
  return { sent: true, provider: "stub" };
}
