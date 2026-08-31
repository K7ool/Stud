/**
 * GET /api/stud/site?site=X
 *
 * Returns whether a plugin is actively connected to the relay for the given
 * siteId. Lets the web app distinguish:
 *   - "no plugin connected" (site → { active: false })
 *   - "plugin connected, but to a DIFFERENT site than this browser" (it will
 *     instead be active on the other site and this one returns { active: false })
 *
 * Response: { active: boolean, site: string }
 */
import { isSiteActive } from "./cache";

export const config = { runtime: "edge" };

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const url = new URL(req.url);
  const site = url.searchParams.get("site") ?? "";

  const active = site !== "" && (await isSiteActive(site));

  return cors(new Response(JSON.stringify({ site, active }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  }));
}
