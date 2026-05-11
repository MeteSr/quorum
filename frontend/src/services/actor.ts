import { AuthClient } from "@icp-sdk/auth/client";
import { HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";

declare const DFX_NETWORK: string;

const IS_LOCAL = (typeof DFX_NETWORK !== "undefined" ? DFX_NETWORK : "local") !== "ic";

// ii: true in icp.yaml deploys II automatically. Port 4943 matches our icp.yaml gateway.
// Must target /authorize — the ICRC-29 heartbeat lives there, not the root URL.
export const II_URL = IS_LOCAL
  ? "http://id.ai.localhost:4943/authorize"
  : "https://id.ai/authorize";

let _authClient: AuthClient | null = null;
let _agent: HttpAgent | null = null;

export function getAuthClient(): AuthClient {
  if (!_authClient) {
    _authClient = new AuthClient({ identityProvider: II_URL });
  }
  return _authClient;
}

export async function getAgent(): Promise<HttpAgent> {
  if (!_agent) {
    const client = getAuthClient();
    const identity = await client.getIdentity();
    _agent = await HttpAgent.create({
      identity,
      host: IS_LOCAL ? "http://localhost:4943" : "https://ic0.app",
    });
    if (IS_LOCAL) {
      await Promise.race([
        _agent.fetchRootKey(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("fetchRootKey timeout")), 2000)
        ),
      ]).catch((err: unknown) => {
        console.warn("[actor] fetchRootKey failed — running in mock mode:", err);
      });
    }
  }
  return _agent;
}

export function resetAgent() {
  _agent = null;
}

export async function loginWithLocalIdentity(): Promise<string> {
  if (!IS_LOCAL) throw new Error("loginWithLocalIdentity() must not be called in production");
  const seed = new Uint8Array(32);
  seed[0] = 7;
  const identity = Ed25519KeyIdentity.generate(seed);
  _agent = await HttpAgent.create({ identity, host: "http://localhost:4943" });
  await Promise.race([
    _agent.fetchRootKey(),
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error("fetchRootKey timeout")), 2000)),
  ]).catch((err: unknown) => {
    console.warn("[actor] fetchRootKey failed — running in mock mode:", err);
  });
  return identity.getPrincipal().toText();
}

export async function login(): Promise<void> {
  const client = getAuthClient();
  try {
    await client.signIn({ maxTimeToLive: BigInt(8 * 60 * 60 * 1_000_000_000) });
  } catch (err) {
    console.error("[actor] signIn failed:", err);
    throw err;
  }
  resetAgent();
}

export async function logout(): Promise<void> {
  const client = getAuthClient();
  await client.logout();
  resetAgent();
  _authClient = null;
}

export function isAuthenticated(): boolean {
  try {
    return getAuthClient().isAuthenticated();
  } catch {
    return false;
  }
}

export async function getPrincipal(): Promise<string> {
  const client = getAuthClient();
  const identity = await client.getIdentity();
  return identity.getPrincipal().toText();
}
