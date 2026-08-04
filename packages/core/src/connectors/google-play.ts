import { importPKCS8, SignJWT } from "jose";
import type { StoreConnector } from "../connector.js";
import type { AppStatus, AppTarget, Channel, ChannelStatus, ReleaseState } from "../types.js";
import { asArray, asNumber, asString } from "./defensive.js";

const PLAY_API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

/** Google Play service-account material supplied directly by the caller. */
export interface GooglePlayCredentials {
  /** `client_email` from the service account JSON */
  clientEmail: string;
  /** `private_key` from the service account JSON (PEM string) */
  privateKey: string;
}

/**
 * Non-2xx answer from Google's OAuth token endpoint. Carries the response
 * body so `storepulse doctor` can tell `invalid_grant` (deleted key, clock
 * skew) apart from other failures (#6).
 */
export class PlayTokenExchangeError extends Error {
  constructor(
    readonly status: number,
    /** Raw response body ("" when it could not be read) */
    readonly body: string,
  ) {
    super(`Google OAuth token exchange failed (${status})`);
    this.name = "PlayTokenExchangeError";
  }
}

/**
 * Exchange a signed service-account JWT for a Play API access token
 * (valid 1 hour). `fetchImpl` is injectable for tests and `storepulse doctor`.
 */
export async function createPlayAccessToken(
  creds: GooglePlayCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const key = await importPKCS8(creds.privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(creds.clientEmail)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new PlayTokenExchangeError(res.status, await res.text().catch(() => ""));
  }
  const data = await res.json();
  const accessToken = asString(data?.access_token);
  if (!accessToken) {
    throw new Error("Google OAuth token response missing access_token");
  }
  return accessToken;
}

const RELEASE_STATE: Record<string, ReleaseState> = {
  completed: "live",
  inProgress: "rollout",
  halted: "halted",
  draft: "draft",
};

function trackToChannel(track: string): Channel {
  if (track === "production") return "production";
  if (track === "internal") return "internal";
  // "beta", "alpha", and custom closed-testing tracks all surface as beta
  return "beta";
}

/** Text from `release.releaseNotes[]` — locale priority ko-KR → en-US → first with text. */
function pickReleaseNotes(releaseNotes: unknown): string | undefined {
  const localized = (asArray(releaseNotes) as any[])
    .map((n) => ({ language: asString(n?.language), text: asString(n?.text) }))
    .filter((n) => n.text !== undefined);
  const pick =
    localized.find((n) => n.language === "ko-KR") ??
    localized.find((n) => n.language === "en-US") ??
    localized[0];
  return pick?.text;
}

/** Read-only connector for one Google Play service account. */
export class GooglePlayConnector implements StoreConnector {
  readonly id = "google-play";

  constructor(private readonly creds: GooglePlayCredentials) {}

  supports(target: AppTarget): boolean {
    return target.platform === "android";
  }

  async fetchAppStatus(target: AppTarget): Promise<AppStatus> {
    const token = await this.token();
    const pkg = target.storeId;

    // The Play API only exposes track info inside an "edit" transaction,
    // even for reads — create one, read tracks, then discard it.
    const edit = await this.request(token, "POST", `/applications/${pkg}/edits`);
    const editId = asString(edit?.id);
    if (!editId) {
      throw new Error("Play API: edits.insert returned no edit id (API shape changed?)");
    }
    try {
      const tracks = await this.request(
        token,
        "GET",
        `/applications/${pkg}/edits/${editId}/tracks`,
      );
      const channels: ChannelStatus[] = [];
      for (const track of asArray(tracks?.tracks) as any[]) {
        // Fields may vanish in a future API version — degrade to "unknown", never crash
        const trackName = asString(track?.track);
        for (const release of asArray(track?.releases) as any[]) {
          const status = asString(release?.status);
          // Play auto-names releases "33 (0.1.18)" (versionCode + versionName);
          // unwrap so the code isn't printed twice next to the build number
          let version: string | null = asString(release?.name) ?? null;
          const autoName = version?.match(/^(\d+)\s*\((.+)\)$/);
          if (autoName) version = autoName[2];
          const lastVersionCode = asArray(release?.versionCodes).at(-1);
          const userFraction = asNumber(release?.userFraction);
          const releaseNotes = pickReleaseNotes(release?.releaseNotes);
          channels.push({
            channel: trackToChannel(trackName ?? ""),
            version,
            build: lastVersionCode != null ? String(lastVersionCode) : (autoName?.[1] ?? null),
            state: (status && RELEASE_STATE[status]) || "unknown",
            rawState: `${trackName ?? "(track missing)"}/${status ?? "(status missing)"}`,
            ...(userFraction !== undefined && {
              rolloutPercent: Math.round(userFraction * 100),
            }),
            ...(releaseNotes !== undefined && { releaseNotes }),
          });
        }
      }
      return { target, channels, fetchedAt: new Date().toISOString() };
    } finally {
      await this.request(token, "DELETE", `/applications/${pkg}/edits/${editId}`).catch(() => {});
    }
  }

  private async request(token: string, method: string, path: string): Promise<any> {
    const res = await fetch(`${PLAY_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Play API ${res.status} on ${method} ${path}`);
    }
    return res.status === 204 ? null : res.json();
  }

  private async token(): Promise<string> {
    return createPlayAccessToken(this.creds);
  }
}
