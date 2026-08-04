import type { ReleaseState } from "../types.js";
import type { Localized } from "./types.js";

/** Board badge color — the CLI (ANSI) and the dashboard (CSS) both follow it. */
export type BadgeColor = "green" | "cyan" | "yellow" | "blue" | "red" | "gray" | "dim";

/** Localized explanation and recommended action for one release state. */
export interface StateExplanation {
  /** Badge text exactly as the board prints it — language-invariant term identity. */
  badge: string;
  color: BadgeColor;
  /** One-line meaning. */
  summary: Localized;
  /** Longer explanation. */
  detail: Localized;
  /** Store-specific raw states that normalize into this state (see connectors/). */
  rawStates: { ios: string[]; android: string[] };
  /** Recommended action. */
  action: Localized;
}

/**
 * Every ReleaseState explained, in the order the explain legend lists them.
 * The Record type makes forgetting a state a compile error; the vitest
 * completeness test additionally pins every state × language at runtime.
 */
export const STATE_EXPLANATIONS: Record<ReleaseState, StateExplanation> = {
  live: {
    badge: "LIVE",
    color: "green",
    summary: {
      en: "Released and available to users on the store.",
      ko: "스토어에 릴리즈되어 사용자에게 제공 중입니다.",
    },
    detail: {
      en:
        "The version passed review and is fully released. On the beta channel this " +
        "also marks a valid TestFlight build that testers can install.",
      ko:
        "심사를 통과해 전체 공개된 상태입니다. 베타 채널에서는 테스터가 설치할 수 있는 " +
        "유효한 TestFlight 빌드도 이 상태로 표시됩니다.",
    },
    rawStates: { ios: ["READY_FOR_SALE", "VALID"], android: ["completed"] },
    action: {
      en: "Nothing to do — keep an eye on crash reports and user reviews.",
      ko: "별도 조치는 필요 없습니다. 크래시 리포트와 사용자 리뷰를 모니터링하세요.",
    },
  },
  rollout: {
    badge: "n%",
    color: "cyan",
    summary: {
      en: "Staged rollout in progress — only part of your users get the update.",
      ko: "단계적 출시가 진행 중입니다. 일부 사용자에게만 업데이트가 배포됩니다.",
    },
    detail: {
      en:
        "iOS phased release or Google Play staged rollout. The badge shows the current " +
        "cumulative percentage of users who can receive this version.",
      ko:
        "iOS 단계적 출시(phased release) 또는 Google Play 단계적 출시(staged rollout)입니다. " +
        "배지의 숫자는 현재 이 버전을 받을 수 있는 사용자 누적 비율입니다.",
    },
    rawStates: { ios: ["ACTIVE (appStoreVersionPhasedRelease)"], android: ["inProgress"] },
    action: {
      en: "Watch crash-free metrics; halt or resume the rollout in the store console if needed.",
      ko: "크래시 등 지표를 지켜보고, 문제가 있으면 스토어 콘솔에서 출시를 중단하거나 재개하세요.",
    },
  },
  "in-review": {
    badge: "REVIEW",
    color: "yellow",
    summary: {
      en: "Waiting for or currently under store review.",
      ko: "스토어 심사 대기 중이거나 심사가 진행 중입니다.",
    },
    detail: {
      en:
        "Submitted to App Store review (or TestFlight beta review). Review times vary " +
        "from a few hours to a few days.",
      ko:
        "App Store 심사(또는 TestFlight 베타 심사)에 제출된 상태입니다. 심사 기간은 " +
        "몇 시간에서 며칠까지 걸릴 수 있습니다.",
    },
    rawStates: {
      ios: ["WAITING_FOR_REVIEW", "IN_REVIEW", "WAITING_FOR_BETA_REVIEW"],
      android: [],
    },
    action: {
      en: "Wait for the review to finish; check App Store Connect for reviewer messages.",
      ko: "심사가 끝날 때까지 기다리세요. App Store Connect에서 심사 메시지를 확인할 수 있습니다.",
    },
  },
  pending: {
    badge: "PENDING",
    color: "blue",
    summary: {
      en: "Approved or processing — not visible to users yet.",
      ko: "승인되었거나 처리 중이며, 아직 사용자에게 공개되지 않았습니다.",
    },
    detail: {
      en:
        "Approved and waiting for a developer or scheduled release, or the uploaded " +
        "binary is still being processed by the store.",
      ko:
        "승인 후 개발자 수동 출시나 예약 출시를 기다리는 중이거나, 업로드된 바이너리를 " +
        "스토어가 아직 처리하고 있는 상태입니다.",
    },
    rawStates: {
      ios: [
        "PENDING_DEVELOPER_RELEASE",
        "PENDING_APPLE_RELEASE",
        "PROCESSING_FOR_APP_STORE",
        "ACCEPTED",
        "PROCESSING",
      ],
      android: [],
    },
    action: {
      en: 'If you release manually, press "Release this version" in App Store Connect when ready.',
      ko: "수동 출시라면 준비되었을 때 App Store Connect에서 '이 버전 출시'를 누르세요.",
    },
  },
  rejected: {
    badge: "REJECTED",
    color: "red",
    summary: {
      en: "Rejected by store review, or the binary is invalid.",
      ko: "스토어 심사에서 거절되었거나 바이너리가 유효하지 않습니다.",
    },
    detail: {
      en:
        "App review rejected the version (binary, metadata, or a developer-side " +
        "rejection), or the uploaded build failed validation.",
      ko:
        "심사에서 버전이 거절되었거나(바이너리·메타데이터·개발자 취소 포함), 업로드한 " +
        "빌드가 검증에 실패한 상태입니다.",
    },
    rawStates: {
      ios: [
        "REJECTED",
        "METADATA_REJECTED",
        "DEVELOPER_REJECTED",
        "INVALID_BINARY",
        "FAILED",
        "INVALID",
      ],
      android: [],
    },
    action: {
      en: "Check the reason in the App Store Connect Resolution Center, fix it, and resubmit.",
      ko: "App Store Connect Resolution Center에서 거절 사유를 확인하고, 수정 후 다시 제출하세요.",
    },
  },
  halted: {
    badge: "HALTED",
    color: "red",
    summary: {
      en: "Staged rollout stopped by the developer.",
      ko: "단계적 출시가 개발자에 의해 중단되었습니다.",
    },
    detail: {
      en:
        "The Google Play staged rollout was halted — users who already received the " +
        "update keep it, but no new users get it.",
      ko:
        "Google Play 단계적 출시가 중단되었습니다. 이미 업데이트를 받은 사용자는 그대로지만, " +
        "새로운 사용자에게는 더 이상 배포되지 않습니다.",
    },
    rawStates: { ios: [], android: ["halted"] },
    action: {
      en: "Fix the problem, then resume the rollout (or ship a new version) in the Play Console.",
      ko: "문제를 해결한 뒤 Play Console에서 출시를 재개하거나 새 버전을 릴리즈하세요.",
    },
  },
  draft: {
    badge: "draft",
    color: "dim",
    summary: {
      en: "Being prepared — not submitted to review yet.",
      ko: "준비 중인 릴리즈로, 아직 심사에 제출되지 않았습니다.",
    },
    detail: {
      en:
        "A draft release: the metadata or build is still being put together. " +
        "Users and reviewers cannot see it.",
      ko: "메타데이터나 빌드를 준비 중인 초안 상태입니다. 사용자와 심사자에게는 보이지 않습니다.",
    },
    rawStates: { ios: ["PREPARE_FOR_SUBMISSION"], android: ["draft"] },
    action: {
      en: "Finish the release and submit it for review.",
      ko: "릴리즈 준비를 마치고 심사에 제출하세요.",
    },
  },
  unknown: {
    badge: "UNKNOWN",
    color: "gray",
    summary: {
      en: "A store state this version of storepulse does not recognize.",
      ko: "이 버전의 storepulse가 알지 못하는 스토어 상태입니다.",
    },
    detail: {
      en:
        "The store returned a state that is not mapped yet (often right after a store " +
        "API change). The raw store state is shown next to the badge.",
      ko:
        "스토어가 아직 매핑되지 않은 상태 값을 반환했습니다(스토어 API 변경 직후에 흔합니다). " +
        "원본 상태 값이 배지 옆에 함께 표시됩니다.",
    },
    rawStates: { ios: [], android: [] },
    action: {
      en: "Check the raw state in the store console; update storepulse if the store added a new state.",
      ko: "스토어 콘솔에서 원본 상태를 확인하세요. 스토어에 새 상태가 추가된 것이라면 storepulse를 업데이트하세요.",
    },
  },
};

/** All release states, in the order the explain legend lists them. */
export const RELEASE_STATES = Object.keys(STATE_EXPLANATIONS) as ReleaseState[];
