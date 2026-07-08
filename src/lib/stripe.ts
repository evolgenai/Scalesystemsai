import Stripe from "stripe";

let stripeClient: Stripe | undefined;

export function getStripe(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not configured.");
  }

  stripeClient = new Stripe(secretKey, {
    typescript: true,
  });

  return stripeClient;
}
