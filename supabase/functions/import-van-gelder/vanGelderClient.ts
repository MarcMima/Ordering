/** Van Gelder APIM: OAuth + per-subscription keys (acc/prod via secrets). */

export type VanGelderApiProduct =
  | "orders"
  | "articles"
  | "assortments"
  | "customer"
  | "prices";

const SUBSCRIPTION_ENV: Record<VanGelderApiProduct, string[]> = {
  orders: ["VAN_GELDER_SUBSCRIPTION_KEY_ORDERS", "VAN_GELDER_SUBSCRIPTION_KEY"],
  articles: ["VAN_GELDER_SUBSCRIPTION_KEY_ARTICLES"],
  assortments: ["VAN_GELDER_SUBSCRIPTION_KEY_ASSORTMENTS"],
  customer: ["VAN_GELDER_SUBSCRIPTION_KEY_CUSTOMER"],
  prices: [
    "VAN_GELDER_SUBSCRIPTION_KEY_PRICES",
    "VAN_GELDER_SUBSCRIPTION_KEY_ORDERS",
    "VAN_GELDER_SUBSCRIPTION_KEY",
  ],
};

export function vanGelderSubscriptionKey(product: VanGelderApiProduct): string | null {
  for (const name of SUBSCRIPTION_ENV[product]) {
    const v = (Deno.env.get(name) ?? "").trim();
    if (v) return v;
  }
  return null;
}

export function vanGelderApiRoot(): string {
  return (
    Deno.env.get("VAN_GELDER_API_BASE_URL") ??
    "https://vg-acc-we-apim.azure-api.net"
  ).replace(/\/+$/, "");
}

export async function getVanGelderAccessToken(): Promise<string> {
  const clientId = Deno.env.get("VAN_GELDER_CLIENT_ID");
  const clientSecret = Deno.env.get("VAN_GELDER_CLIENT_SECRET");
  const tokenUrl = Deno.env.get("VAN_GELDER_TOKEN_URL");
  const scope = Deno.env.get("VAN_GELDER_SCOPE");

  if (!clientId || !clientSecret || !tokenUrl || !scope) {
    throw new Error(
      "Van Gelder OAuth ontbreekt: VAN_GELDER_CLIENT_ID, CLIENT_SECRET, TOKEN_URL, SCOPE"
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(
      `Van Gelder OAuth ${response.status}: ${await response.text()}`
    );
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Van Gelder OAuth: geen access_token");
  return json.access_token;
}

export async function vanGelderFetch(
  product: VanGelderApiProduct,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const subscriptionKey = vanGelderSubscriptionKey(product);
  if (!subscriptionKey) {
    throw new Error(
      `Van Gelder subscription key ontbreekt voor ${product} (zie VAN_GELDER_SUBSCRIPTION_KEY_*)`
    );
  }

  const token = await getVanGelderAccessToken();
  const url = path.startsWith("http")
    ? path
    : `${vanGelderApiRoot()}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Ocp-Apim-Subscription-Key", subscriptionKey);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  return fetch(url, { ...init, headers });
}
