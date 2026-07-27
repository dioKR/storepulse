import { importPKCS8, SignJWT } from "jose";
import type { StoreConnector } from "../connector.js";
import type { AppStatus, AppTarget, Channel, ChannelStatus, ReleaseState } from "../types.js";

const PLAY_API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

export interface GooglePlayCredentials {
  /** `client_email` from the service account JSON */
  clientEmail: string;
  /** `private_key` from the service account JSON (PEM string) */
  privateKey: string;
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
    try {
      const tracks = await this.request(
        token,
        "GET",
        `/applications/${pkg}/edits/${edit.id}/tracks`,
      );
      const channels: ChannelStatus[] = [];
      for (const track of tracks.tracks ?? []) {
        for (const release of track.releases ?? []) {
          // Play auto-names releases "33 (0.1.18)" (versionCode + versionName);
          // unwrap so the code isn't printed twice next to the build number
          let version: string | null = release.name ?? null;
          const autoName = version?.match(/^(\d+)\s*\((.+)\)$/);
          if (autoName) version = autoName[2];
          channels.push({
            channel: trackToChannel(track.track),
            version,
            build: release.versionCodes?.at(-1) ?? autoName?.[1] ?? null,
            state: RELEASE_STATE[release.status] ?? "unknown",
            rawState: `${track.track}/${release.status}`,
            ...(release.userFraction != null && {
              rolloutPercent: Math.round(release.userFraction * 100),
            }),
          });
        }
      }
      return { target, channels, fetchedAt: new Date().toISOString() };
    } finally {
      await this.request(token, "DELETE", `/applications/${pkg}/edits/${edit.id}`).catch(() => {});
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
    const key = await importPKCS8(this.creds.privateKey, "RS256");
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(this.creds.clientEmail)
      .setAudience(TOKEN_URL)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!res.ok) {
      throw new Error(`Google OAuth token exchange failed (${res.status})`);
    }
    const data = await res.json();
    return data.access_token;
  }
}
