import { importPKCS8, SignJWT } from "jose";
import type { StoreConnector } from "../connector.js";
import type { AppStatus, AppTarget, ChannelStatus, ReleaseState } from "../types.js";
import { asArray, asNumber, asString } from "./defensive.js";

const ASC_API = "https://api.appstoreconnect.apple.com/v1";

export interface AscCredentials {
  keyId: string;
  issuerId: string;
  /** Contents of the .p8 private key (PEM string, not a path) */
  privateKey: string;
}

/**
 * Signed ES256 JWT for the App Store Connect API (valid 15 minutes).
 * Throws when the .p8 key cannot be parsed — `storepulse doctor` relies on
 * that to tell "broken key file" apart from "key rejected by Apple" (#6).
 */
export async function createAscToken(creds: AscCredentials): Promise<string> {
  const key = await importPKCS8(creds.privateKey, "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: creds.keyId, typ: "JWT" })
    .setIssuer(creds.issuerId)
    .setAudience("appstoreconnect-v1")
    .setIssuedAt(now)
    .setExpirationTime(now + 15 * 60)
    .sign(key);
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
      `/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=5&fields[appStoreVersions]=versionString,appStoreState,createdDate`,
    );
    const entries: { id: string | undefined; channel: ChannelStatus }[] = [];
    for (const version of asArray(data?.data) as any[]) {
      // Field may vanish in a future API version — degrade to "unknown", never crash
      const rawState = asString(version?.attributes?.appStoreState);
      // Superseded versions would only repeat what the live row already says
      if (rawState === "REPLACED_WITH_NEW_VERSION") continue;
      const createdDate = asString(version?.attributes?.createdDate);
      entries.push({
        id: asString(version?.id),
        channel: {
          channel: "production",
          version: asString(version?.attributes?.versionString) ?? null,
          state: (rawState && APP_STORE_STATE[rawState]) || "unknown",
          rawState: rawState ?? "(appStoreState missing)",
          ...(createdDate !== undefined && { date: createdDate }),
        },
      });
    }

    // The API returns newest first; older versions can keep a live-looking state
    // forever, so everything past the first live entry is store history — drop it.
    const firstLive = entries.findIndex((e) => e.channel.state === "live");
    const current = firstLive === -1 ? entries : entries.slice(0, firstLive + 1);

    const live = current.find((e) => e.channel.state === "live" && e.id !== undefined);
    // Release notes only for the 1-3 entries that survived the history trim,
    // one extra call each — never for the full 5-item page.
    await Promise.all([
      ...current
        .filter((e) => e.id !== undefined)
        .map(async (e) => {
          const notes = await this.fetchReleaseNotes(e.id as string);
          if (notes !== undefined) e.channel.releaseNotes = notes;
        }),
      (async () => {
        if (!live?.id) return;
        const rollout = await this.fetchPhasedRelease(live.id);
        if (rollout !== null) {
          live.channel.state = "rollout";
          live.channel.rolloutPercent = rollout;
        }
      })(),
    ]);
    return current.map((e) => e.channel);
  }

  /** "What's New" of one version — locale priority ko → en-US → first with text. */
  private async fetchReleaseNotes(versionId: string): Promise<string | undefined> {
    try {
      const data = await this.get(
        `/appStoreVersions/${versionId}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale,whatsNew`,
      );
      const locs = (asArray(data?.data) as any[]).map((l) => ({
        locale: asString(l?.attributes?.locale),
        whatsNew: asString(l?.attributes?.whatsNew),
      }));
      const withNotes = locs.filter((l) => l.whatsNew !== undefined);
      const pick =
        withNotes.find((l) => l.locale === "ko") ??
        withNotes.find((l) => l.locale === "en-US") ??
        withNotes[0];
      return pick?.whatsNew;
    } catch {
      // Notes are decoration — a failed localization call must not sink the row
      return undefined;
    }
  }

  private async fetchPhasedRelease(versionId: string): Promise<number | null> {
    try {
      const data = await this.get(`/appStoreVersions/${versionId}/appStoreVersionPhasedRelease`);
      const attrs = data?.data?.attributes;
      if (attrs?.phasedReleaseState !== "ACTIVE") return null;
      const day = Math.min(asNumber(attrs.currentDayNumber) ?? 1, PHASED_RELEASE_PERCENT.length);
      return PHASED_RELEASE_PERCENT[Math.max(day - 1, 0)];
    } catch {
      // 404 = no phased release configured for this version
      return null;
    }
  }

  private async fetchLatestTestFlightBuild(appId: string): Promise<ChannelStatus[]> {
    const data = await this.get(
      `/builds?filter[app]=${appId}&sort=-uploadedDate&limit=1&fields[builds]=version,processingState,uploadedDate,expirationDate&include=preReleaseVersion&fields[preReleaseVersions]=version`,
    );
    const build = asArray(data?.data)[0] as any;
    if (!build) return [];
    const marketingVersion =
      asString(
        (asArray(data?.included) as any[]).find((i) => i?.type === "preReleaseVersions")?.attributes
          ?.version,
      ) ?? null;
    const rawState = asString(build?.attributes?.processingState);
    const uploadedDate = asString(build?.attributes?.uploadedDate);
    const expirationDate = asString(build?.attributes?.expirationDate);
    return [
      {
        channel: "beta",
        version: marketingVersion,
        build: asString(build?.attributes?.version) ?? null,
        state: (rawState && BUILD_PROCESSING_STATE[rawState]) || "unknown",
        rawState: rawState ?? "(processingState missing)",
        ...(uploadedDate !== undefined && { date: uploadedDate }),
        ...(expirationDate !== undefined && { expiresAt: expirationDate }),
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
    return createAscToken(this.creds);
  }
}
