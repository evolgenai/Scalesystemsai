export type FiatCurrency = "USD" | "EUR";

export type BvnkPayInRequest = {
  walletId: string;
  type: "IN";
  amount: number;
  currency: FiatCurrency;
  reference: string;
  returnUrl: string;
  expiryMinutes?: number;
  payInDetails?: {
    currency?: string;
  };
  metadata?: {
    userId: string;
    plan: "PREMIUM";
    service: string;
  };
};

export type BvnkPayInResponse = {
  uuid?: string;
  id?: string;
  reference?: string;
  status?: string;
  redirectUrl?: string;
};

export type BvnkWebhookPayload = {
  event?: string;
  status?: string;
  reference?: string;
  metadata?: {
    userId?: string;
    plan?: string;
  };
  data?: {
    status?: string;
    reference?: string;
    metadata?: {
      userId?: string;
      plan?: string;
    };
  };
};
