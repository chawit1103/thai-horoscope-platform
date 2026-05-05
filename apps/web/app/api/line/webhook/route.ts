import { HttpLineProvider } from "../../../../src/mvp/line-gateway";

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const provider = new HttpLineProvider({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    userIdHashSecret: process.env.LINE_CHANNEL_SECRET,
  });

  if (!(await provider.verifyWebhook(request.headers, body))) {
    return Response.json({ ok:false }, { status:401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return Response.json({ ok:false }, { status:400 });
  }

  const events = await provider.normalizeWebhook(parsed);
  return Response.json({ ok:true, eventCount:events.length });
}
