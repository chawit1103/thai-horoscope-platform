import { HttpPaymentProvider, processPaymentWebhook } from "../../../../src/mvp/payment-provider";

export async function POST(request:Request):Promise<Response> {
  const rawBody = await request.text();
  const provider = new HttpPaymentProvider({
    checkoutEndpoint: process.env.PAYMENT_PROVIDER_CHECKOUT_ENDPOINT,
    apiKey: process.env.PAYMENT_PROVIDER_API_KEY,
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET,
  });

  if (!process.env.PAYMENT_WEBHOOK_SECRET?.trim()) return Response.json({ ok:false, error:"PAYMENT_WEBHOOK_SECRET is required." }, { status:500 });

  const result = await processPaymentWebhook({ provider, headers:request.headers, rawBody });
  if (result.status === "rejected") return Response.json({ ok:false, error:result.reason }, { status:401 });
  return Response.json({ ok:true, status:result.status });
}
