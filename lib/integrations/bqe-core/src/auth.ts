import axios from "axios";
import { eq } from "drizzle-orm";
import type { CoreTokenResponse } from "./types.js";

const IDENTITY_URL = "https://api-identity.bqe.com";
const AUTHORIZE_PATH = "/authorize";
const TOKEN_PATH = "/token";

export interface BqeAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getAuthorizationUrl(config: BqeAuthConfig, state?: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "openid profile read write",
  });
  if (state) params.set("state", state);
  return `${IDENTITY_URL}${AUTHORIZE_PATH}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  config: BqeAuthConfig,
  code: string
): Promise<CoreTokenResponse> {
  const response = await axios.post(
    `${IDENTITY_URL}${TOKEN_PATH}`,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );
  return response.data;
}

export async function refreshAccessToken(
  config: BqeAuthConfig,
  refreshToken: string
): Promise<CoreTokenResponse> {
  const response = await axios.post(
    `${IDENTITY_URL}${TOKEN_PATH}`,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );
  return response.data;
}

/**
 * Extract the API base URL from the token response.
 * BQE Core returns the API base URL in the `resources` array.
 */
export function extractBaseUrl(tokenResponse: CoreTokenResponse): string {
  if (tokenResponse.resources && tokenResponse.resources.length > 0) {
    return tokenResponse.resources[0].replace(/\/$/, "");
  }
  throw new Error("No API base URL found in token response resources");
}
