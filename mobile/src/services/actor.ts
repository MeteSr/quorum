/**
 * React Native ICP actor factory.
 *
 * II auth uses a WebView flow: an Ed25519 session key is generated, II signs a
 * DelegationChain for it, and the delegation is persisted in SecureStore between
 * launches. On subsequent opens the delegation is restored (if not expired) and
 * the user is shown biometric re-auth instead of a full II login.
 */

import * as SecureStore from "expo-secure-store";
import { Ed25519KeyIdentity, DelegationChain, DelegationIdentity } from "@dfinity/identity";
import { HttpAgent, Actor } from "@dfinity/agent";
import Constants from "expo-constants";

const { icHost } = Constants.expoConfig?.extra ?? {};
const HOST = (icHost as string | undefined) ?? "https://ic0.app";
const II_URL = (Constants.expoConfig?.extra?.iiUrl as string | undefined) ?? "https://identity.ic0.app";

export { II_URL };

const SECURE_KEY_SESSION = "quorum_session_key";
const SECURE_KEY_DELEGATION = "quorum_delegation";

let _agent: HttpAgent | null = null;
let _identity: DelegationIdentity | null = null;
let _sessionKey: Ed25519KeyIdentity | null = null;

// ─── Session key (persisted) ─────────────────────────────────────────────────

export async function getOrCreateSessionKey(): Promise<Ed25519KeyIdentity> {
  if (_sessionKey) return _sessionKey;
  const stored = await SecureStore.getItemAsync(SECURE_KEY_SESSION);
  if (stored) {
    try {
      _sessionKey = Ed25519KeyIdentity.fromJSON(stored);
      return _sessionKey;
    } catch {
      // corrupted — fall through to create new
    }
  }
  _sessionKey = Ed25519KeyIdentity.generate();
  await SecureStore.setItemAsync(SECURE_KEY_SESSION, JSON.stringify(_sessionKey.toJSON()));
  return _sessionKey;
}

export function getSessionPublicKeyHex(): string | null {
  if (!_sessionKey) return null;
  const raw = _sessionKey.getPublicKey().toDer();
  return Buffer.from(raw).toString("hex");
}

// ─── Delegation (persisted) ──────────────────────────────────────────────────

export async function saveDelegation(chain: DelegationChain): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEY_DELEGATION, JSON.stringify(chain.toJSON()));
  _identity = null;
  _agent = null;
}

export async function loadDelegation(): Promise<DelegationChain | null> {
  const stored = await SecureStore.getItemAsync(SECURE_KEY_DELEGATION);
  if (!stored) return null;
  try {
    return DelegationChain.fromJSON(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function clearDelegation(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_KEY_DELEGATION);
  _identity = null;
  _agent = null;
}

// ─── Identity / Agent ────────────────────────────────────────────────────────

export async function getIdentity(): Promise<DelegationIdentity | null> {
  if (_identity) return _identity;
  const sessionKey = await getOrCreateSessionKey();
  const chain = await loadDelegation();
  if (!chain) return null;
  // Expired delegations are rejected by the replica — treat as logged out.
  if (isDelegationExpired(chain)) {
    await clearDelegation();
    return null;
  }
  _identity = DelegationIdentity.fromDelegation(sessionKey, chain);
  return _identity;
}

function isDelegationExpired(chain: DelegationChain): boolean {
  const nowNs = BigInt(Date.now()) * BigInt(1_000_000);
  for (const d of chain.delegations) {
    if (BigInt(d.delegation.expiration.toString()) < nowNs) return true;
  }
  return false;
}

export async function getAgent(): Promise<HttpAgent | null> {
  if (_agent) return _agent;
  const identity = await getIdentity();
  if (!identity) return null;
  _agent = await HttpAgent.create({ identity, host: HOST });
  return _agent;
}

export function createActor<T>(idlFactory: any, canisterId: string): Promise<T | null> {
  return getAgent().then((agent) => {
    if (!agent || !canisterId) return null;
    return Actor.createActor(idlFactory, { agent, canisterId }) as T;
  });
}

export async function getPrincipal(): Promise<string | null> {
  const identity = await getIdentity();
  return identity ? identity.getPrincipal().toText() : null;
}

export function isAuthenticated(): boolean {
  return _identity !== null;
}

export async function logout(): Promise<void> {
  await clearDelegation();
}
