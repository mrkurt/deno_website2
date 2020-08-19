import { LFU } from "../deps.ts";

interface CachedResponse {
  headers: Headers;
  body: ArrayBuffer;
  status: number;
}
const cache = new LFU<CachedResponse>({
  capacity: 100000,
});
export async function responseCache(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  const req = toRequest(input, init);
  req.headers.delete("Accept-Encoding");
  const key = cacheKey(req);

  const cached = cache.get(key);
  if (cached) {
    const { status, headers, body } = cached;

    // required workaround for Deno bug
    const stream = arrayBufferToStream(body);
    const resp = new Response(stream, { status, headers });
    resp.headers.set("Fly-Cache-Status", "HIT");
    return resp;
  }
  const resp = await fetch(req);
  const forCache = resp.clone();

  const body = await forCache.arrayBuffer();
  const cacheEntry = {
    body: body,
    headers: resp.headers,
    status: resp.status,
  };
  resp.headers.set("Fly-Cache-Status", "MISS");
  console.log(
    "Body length:",
    body.constructor.name,
    resp.headers.get("content-length"),
  );
  cache.set(key, cacheEntry, 3600 * 24); // cache for 24 hours by default
  return resp;
}

function cacheKey(req: Request): string {
  const parts = [req.method, req.url];
  return parts.join("|");
}
function toRequest(input: RequestInfo, init?: RequestInit): Request {
  if (typeof input === "string" || init != undefined) {
    return new Request(input, init);
  }
  return input;
}

// TODO: hack to get around deno bug: https://github.com/denoland/deno/issues/6752
function arrayBufferToStream(buf: ArrayBuffer): ReadableStream {
  return new ReadableStream({
    start(controller: any) {
      controller.enqueue(buf);
      controller.close();
    },
  });
}
