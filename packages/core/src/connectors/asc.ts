import { importPKCS8, SignJWT } from "jose";
import type { StoreConnector } from "../connector.js";
import type { AppStatus, AppTarget, ChannelStatus, ReleaseState } from "../types.js";

const ASC_API = "https://api.appstoreconnect.apple.com/v1";

export interface AscCredentials {
  keyId: string;
  issuerId: string;
  /** Contents of the .p8 private key (PEM string, not a path) */
  privateKey: string;
}

const APP_STORE_STATE: Record<string, ReleaseState> = {
  READY_FOR_SALE: "live",
  PROCESSING_FOR_APP_STORE: "pending",
  PENDING_DEVELOPER_RELEASE: "pending",
  PENDING_APPLE_RELEASE: "pending",
  ACCEPTED: "pending",
  IN_REVIEW: "in-review",
  WAITING_FOR_REVIEW: "in-review",
  REJECTED: "rejected",
  METADATA_REJECTED: "rejected",
  DEVELOPER_REJECTED: "rejected",
  INVALID_BINARY: "rejected",
  PREPARE_FOR_SUBMISSION: "draft",
};

/** Apple's phased release schedule: day number → cumulative % of users */
const PHASED_RELEASE_PERCENT = [1, 2, 5, 10, 20, 50, 100];

const BUILD_PROCESSING_STATE: Record<string, ReleaseState> = {
  PROCESSING: "pending",
  VALID: "live",
  FAILED: "rejected",
  INVALID: "rejected",
};

export class AscConnector implements StoreConnector {
  readonly id = "app-store-connect";

  constructor(private readonly creds: AscCredentials) {}

  supports(target: AppTarget): boolean {
    return target.platform === "ios";
  }

  async fetchAppStatus(target: AppTarget): Promise<AppStatus> {
    const [production, beta] = await Promise.all([
      this.fetchAppStoreVersions(target.storeId),
      this.fetchLatestTestFlightBuild(target.storeId),
    ]);
    return {
      target,
      channels: [...production, ...beta],
      fetchedAt: new Date().toISOString(),
    };
  }

  private async fetchAppStoreVersions(appId: string): Promise<ChannelStatus[]> {
    const data = await this.get(
      `/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=5&fields[appStoreVersions]=versionString,appStoreState`,
    );
    const entries: { id: string; channel: ChannelStatus }[] = [];
    for (const version of data.data ?? []) {
      const rawState: string = version.attributes.appStoreState;
      // Superseded versions would only repeat what the live row already says
      if (rawState === "REPLACED_WITH_NEW_VERSION") continue;
      entries.push({
        id: version.id,
        channel: {
          channel: "production",
          version: version.attributes.versionString,
          state: APP_STORE_STATE[rawState] ?? "unknown",
          rawState,
        },
      });
    }

    // The API returns newest first; older versions can keep a live-looking state
    // forever, so everything past the first live entry is store history — drop it.
    const firstLive = entries.findIndex((e) => e.channel.state === "live");
    const current = firstLive === -1 ? entries : entries.slice(0, firstLive + 1);

    const live = current.find((e) => e.channel.state === "live");
    if (live) {
      const rollout = await this.fetchPhasedRelease(live.id);
      if (rollout !== null) {
        live.channel.state = "rollout";
        live.channel.rolloutPercent = rollout;
      }
    }
    return current.map((e) => e.channel);
  }

  private async fetchPhasedRelease(versionId: string): Promise<number | null> {
    try {
      const data = await this.get(`/appStoreVersions/${versionId}/appStoreVersionPhasedRelease`);
      const attrs = data.data?.attributes;
      if (attrs?.phasedReleaseState !== "ACTIVE") return null;
      const day = Math.min(attrs.currentDayNumber ?? 1, PHASED_RELEASE_PERCENT.length);
      return PHASED_RELEASE_PERCENT[day - 1];
    } catch {
      // 404 = no phased release configured for this version
      return null;
    }
  }

  private async fetchLatestTestFlightBuild(appId: string): Promise<ChannelStatus[]> {
    const data = await this.get(
      `/builds?filter[app]=${appId}&sort=-uploadedDate&limit=1&fields[builds]=version,processingState&include=preReleaseVersion&fields[preReleaseVersions]=version`,
    );
    const build = data.data?.[0];
    if (!build) return [];
    const marketingVersion: string | null =
      data.included?.find((i: { type: string }) => i.type === "preReleaseVersions")?.attributes
        ?.version ?? null;
    const rawState: string = build.attributes.processingState;
    return [
      {
        channel: "beta",
        version: marketingVersion,
        build: build.attributes.version,
        state: BUILD_PROCESSING_STATE[rawState] ?? "unknown",
        rawState,
      },
    ];
  }

  private async get(path: string): Promise<any> {
    const res = await fetch(`${ASC_API}${path}`, {
      headers: { Authorization: `Bearer ${await this.token()}` },
    });
    if (!res.ok) {
      throw new Error(`ASC API ${res.status} on ${path.split("?")[0]}`);
    }
    return res.json();
  }

  private async token(): Promise<string> {
    const key = await importPKCS8(this.creds.privateKey, "ES256");
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: this.creds.keyId, typ: "JWT" })
      .setIssuer(this.creds.issuerId)
      .setAudience("appstoreconnect-v1")
      .setIssuedAt(now)
      .setExpirationTime(now + 15 * 60)
      .sign(key);
  }
}
