import Hawk from "hawk";

export type BvnkHawkCredentials = {
  id: string;
  key: string;
};

export function getBvnkHawkCredentials(): BvnkHawkCredentials | null {
  const id =
    process.env.BVNK_HAWK_AUTH_ID?.trim() ||
    process.env.BVNK_API_KEY?.trim() ||
    "";
  const key =
    process.env.BVNK_HAWK_AUTH_KEY?.trim() ||
    process.env.BVNK_API_SECRET?.trim() ||
    "";

  if (!id || !key || id.includes("placeholder") || key.includes("placeholder")) {
    return null;
  }

  return { id, key };
}

export function buildBvnkAuthorizationHeader(
  url: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  credentials: BvnkHawkCredentials
): string {
  const { header } = Hawk.client.header(url, method, {
    credentials: {
      id: credentials.id,
      key: credentials.key,
      algorithm: "sha256",
    },
  });

  if (!header) {
    throw new Error("Failed to generate BVNK Hawk authorization header.");
  }

  return header;
}
