// GENERATED FILE — do not edit by hand.
// Single source: packages/core/src/i18n/ — regenerate with
// `node scripts/gen-dashboard-i18n.mjs` (runs automatically in `pnpm build`).
export const SUPPORTED_LANGS = ["en","ko"];
export const STATE_EXPLANATIONS = {
  "live": {
    "badge": "LIVE",
    "color": "green",
    "summary": {
      "en": "Released and available to users on the store.",
      "ko": "스토어에 릴리즈되어 사용자에게 제공 중입니다."
    },
    "detail": {
      "en": "The version passed review and is fully released. On the beta channel this also marks a valid TestFlight build that testers can install.",
      "ko": "심사를 통과해 전체 공개된 상태입니다. 베타 채널에서는 테스터가 설치할 수 있는 유효한 TestFlight 빌드도 이 상태로 표시됩니다."
    },
    "rawStates": {
      "ios": [
        "READY_FOR_SALE",
        "VALID"
      ],
      "android": [
        "completed"
      ]
    },
    "action": {
      "en": "Nothing to do — keep an eye on crash reports and user reviews.",
      "ko": "별도 조치는 필요 없습니다. 크래시 리포트와 사용자 리뷰를 모니터링하세요."
    }
  },
  "rollout": {
    "badge": "n%",
    "color": "cyan",
    "summary": {
      "en": "Staged rollout in progress — only part of your users get the update.",
      "ko": "단계적 출시가 진행 중입니다. 일부 사용자에게만 업데이트가 배포됩니다."
    },
    "detail": {
      "en": "iOS phased release or Google Play staged rollout. The badge shows the current cumulative percentage of users who can receive this version.",
      "ko": "iOS 단계적 출시(phased release) 또는 Google Play 단계적 출시(staged rollout)입니다. 배지의 숫자는 현재 이 버전을 받을 수 있는 사용자 누적 비율입니다."
    },
    "rawStates": {
      "ios": [
        "ACTIVE (appStoreVersionPhasedRelease)"
      ],
      "android": [
        "inProgress"
      ]
    },
    "action": {
      "en": "Watch crash-free metrics; halt or resume the rollout in the store console if needed.",
      "ko": "크래시 등 지표를 지켜보고, 문제가 있으면 스토어 콘솔에서 출시를 중단하거나 재개하세요."
    }
  },
  "in-review": {
    "badge": "REVIEW",
    "color": "yellow",
    "summary": {
      "en": "Waiting for or currently under store review.",
      "ko": "스토어 심사 대기 중이거나 심사가 진행 중입니다."
    },
    "detail": {
      "en": "Submitted to App Store review (or TestFlight beta review). Review times vary from a few hours to a few days.",
      "ko": "App Store 심사(또는 TestFlight 베타 심사)에 제출된 상태입니다. 심사 기간은 몇 시간에서 며칠까지 걸릴 수 있습니다."
    },
    "rawStates": {
      "ios": [
        "WAITING_FOR_REVIEW",
        "IN_REVIEW",
        "WAITING_FOR_BETA_REVIEW"
      ],
      "android": []
    },
    "action": {
      "en": "Wait for the review to finish; check App Store Connect for reviewer messages.",
      "ko": "심사가 끝날 때까지 기다리세요. App Store Connect에서 심사 메시지를 확인할 수 있습니다."
    }
  },
  "pending": {
    "badge": "PENDING",
    "color": "blue",
    "summary": {
      "en": "Approved or processing — not visible to users yet.",
      "ko": "승인되었거나 처리 중이며, 아직 사용자에게 공개되지 않았습니다."
    },
    "detail": {
      "en": "Approved and waiting for a developer or scheduled release, or the uploaded binary is still being processed by the store.",
      "ko": "승인 후 개발자 수동 출시나 예약 출시를 기다리는 중이거나, 업로드된 바이너리를 스토어가 아직 처리하고 있는 상태입니다."
    },
    "rawStates": {
      "ios": [
        "PENDING_DEVELOPER_RELEASE",
        "PENDING_APPLE_RELEASE",
        "PROCESSING_FOR_APP_STORE",
        "ACCEPTED",
        "PROCESSING"
      ],
      "android": []
    },
    "action": {
      "en": "If you release manually, press \"Release this version\" in App Store Connect when ready.",
      "ko": "수동 출시라면 준비되었을 때 App Store Connect에서 '이 버전 출시'를 누르세요."
    }
  },
  "rejected": {
    "badge": "REJECTED",
    "color": "red",
    "summary": {
      "en": "Rejected by store review, or the binary is invalid.",
      "ko": "스토어 심사에서 거절되었거나 바이너리가 유효하지 않습니다."
    },
    "detail": {
      "en": "App review rejected the version (binary, metadata, or a developer-side rejection), or the uploaded build failed validation.",
      "ko": "심사에서 버전이 거절되었거나(바이너리·메타데이터·개발자 취소 포함), 업로드한 빌드가 검증에 실패한 상태입니다."
    },
    "rawStates": {
      "ios": [
        "REJECTED",
        "METADATA_REJECTED",
        "DEVELOPER_REJECTED",
        "INVALID_BINARY",
        "FAILED",
        "INVALID"
      ],
      "android": []
    },
    "action": {
      "en": "Check the reason in the App Store Connect Resolution Center, fix it, and resubmit.",
      "ko": "App Store Connect Resolution Center에서 거절 사유를 확인하고, 수정 후 다시 제출하세요."
    }
  },
  "halted": {
    "badge": "HALTED",
    "color": "red",
    "summary": {
      "en": "Staged rollout stopped by the developer.",
      "ko": "단계적 출시가 개발자에 의해 중단되었습니다."
    },
    "detail": {
      "en": "The Google Play staged rollout was halted — users who already received the update keep it, but no new users get it.",
      "ko": "Google Play 단계적 출시가 중단되었습니다. 이미 업데이트를 받은 사용자는 그대로지만, 새로운 사용자에게는 더 이상 배포되지 않습니다."
    },
    "rawStates": {
      "ios": [],
      "android": [
        "halted"
      ]
    },
    "action": {
      "en": "Fix the problem, then resume the rollout (or ship a new version) in the Play Console.",
      "ko": "문제를 해결한 뒤 Play Console에서 출시를 재개하거나 새 버전을 릴리즈하세요."
    }
  },
  "draft": {
    "badge": "draft",
    "color": "dim",
    "summary": {
      "en": "Being prepared — not submitted to review yet.",
      "ko": "준비 중인 릴리즈로, 아직 심사에 제출되지 않았습니다."
    },
    "detail": {
      "en": "A draft release: the metadata or build is still being put together. Users and reviewers cannot see it.",
      "ko": "메타데이터나 빌드를 준비 중인 초안 상태입니다. 사용자와 심사자에게는 보이지 않습니다."
    },
    "rawStates": {
      "ios": [
        "PREPARE_FOR_SUBMISSION"
      ],
      "android": [
        "draft"
      ]
    },
    "action": {
      "en": "Finish the release and submit it for review.",
      "ko": "릴리즈 준비를 마치고 심사에 제출하세요."
    }
  },
  "unknown": {
    "badge": "UNKNOWN",
    "color": "gray",
    "summary": {
      "en": "A store state this version of storepulse does not recognize.",
      "ko": "이 버전의 storepulse가 알지 못하는 스토어 상태입니다."
    },
    "detail": {
      "en": "The store returned a state that is not mapped yet (often right after a store API change). The raw store state is shown next to the badge.",
      "ko": "스토어가 아직 매핑되지 않은 상태 값을 반환했습니다(스토어 API 변경 직후에 흔합니다). 원본 상태 값이 배지 옆에 함께 표시됩니다."
    },
    "rawStates": {
      "ios": [],
      "android": []
    },
    "action": {
      "en": "Check the raw state in the store console; update storepulse if the store added a new state.",
      "ko": "스토어 콘솔에서 원본 상태를 확인하세요. 스토어에 새 상태가 추가된 것이라면 storepulse를 업데이트하세요."
    }
  }
};
export const UI_STRINGS = {
  "cli.hint.explain": {
    "en": "state meanings: storepulse explain",
    "ko": "상태 의미 설명: storepulse explain"
  },
  "cli.error.unknownCommand": {
    "en": "Unknown command \"{command}\".",
    "ko": "\"{command}\"은(는) 알 수 없는 명령입니다."
  },
  "cli.help.default": {
    "en": "show the release board for storepulse.config.json",
    "ko": "storepulse.config.json의 릴리즈 보드를 표시"
  },
  "cli.help.init": {
    "en": "create storepulse.config.json + .env templates here",
    "ko": "현재 폴더에 storepulse.config.json + .env 템플릿 생성"
  },
  "cli.help.demo": {
    "en": "show the board with sample data (no credentials needed)",
    "ko": "샘플 데이터로 보드를 표시 (크리덴셜 불필요)"
  },
  "cli.help.snapshot": {
    "en": "print the board as JSON (--demo, --out <file>)",
    "ko": "보드를 JSON으로 출력 (--demo, --out <file>)"
  },
  "cli.help.serve": {
    "en": "local web dashboard (--demo, --port, --host, --refresh)",
    "ko": "로컬 웹 대시보드 (--demo, --port, --host, --refresh)"
  },
  "cli.help.explain": {
    "en": "explain release states (explain [state])",
    "ko": "릴리즈 상태 설명 (explain [state])"
  },
  "cli.help.lang": {
    "en": "output language (also: STOREPULSE_LANG, OS locale)",
    "ko": "출력 언어 (STOREPULSE_LANG, OS 로케일도 지원)"
  },
  "init.created": {
    "en": "created {file}",
    "ko": "{file}을(를) 생성했습니다"
  },
  "init.skipped": {
    "en": "{file} already exists — skipped (never overwritten)",
    "ko": "{file}이(가) 이미 있어 건너뜁니다 (덮어쓰지 않습니다)"
  },
  "init.gitignoreCreated": {
    "en": "created .gitignore ignoring {entries}",
    "ko": ".gitignore를 생성해 {entries}을(를) 무시하도록 했습니다"
  },
  "init.gitignoreAppended": {
    "en": "appended {entries} to .gitignore",
    "ko": ".gitignore에 {entries}을(를) 추가했습니다"
  },
  "init.gitignoreUnchanged": {
    "en": ".gitignore already ignores all credential files",
    "ko": ".gitignore가 이미 모든 크리덴셜 파일을 무시하고 있습니다"
  },
  "init.nextSteps": {
    "en": "next steps",
    "ko": "다음 단계"
  },
  "init.stepConfig": {
    "en": "add your apps to storepulse.config.json — storeId is the numeric Apple ID on the App Store Connect app page (ios) or the package name (android)",
    "ko": "storepulse.config.json에 앱 정보를 입력하세요 — storeId는 App Store Connect 앱 페이지의 숫자 Apple ID(ios) 또는 패키지명(android)입니다"
  },
  "init.stepKeys": {
    "en": "issue read-only store API keys — tutorial: https://diokr.github.io/storepulse/",
    "ko": "스토어 API 키를 발급하세요 — 튜토리얼: https://diokr.github.io/storepulse/ko/"
  },
  "init.stepRun": {
    "en": "when both are done, run: npx storepulse",
    "ko": "완료되면 실행: npx storepulse"
  },
  "snapshot.written": {
    "en": "snapshot written to {path}",
    "ko": "스냅샷을 {path}에 저장했습니다"
  },
  "serve.started": {
    "en": "dashboard on {url}  (api: /api/status, {mode})",
    "ko": "대시보드 실행 중: {url}  (api: /api/status, {mode})"
  },
  "serve.modeDemo": {
    "en": "demo data",
    "ko": "데모 데이터"
  },
  "serve.modeRefresh": {
    "en": "refresh <= {seconds}s",
    "ko": "새로고침 <= {seconds}초"
  },
  "serve.bindWarning": {
    "en": "warning — binding to {host} exposes your release board beyond this machine",
    "ko": "경고 — {host} 바인딩은 릴리즈 보드를 이 컴퓨터 밖으로 노출합니다"
  },
  "serve.dashboardMissing": {
    "en": "dashboard assets not found — in the monorepo run `pnpm build` first (they are bundled with the published storepulse package)",
    "ko": "대시보드 자산을 찾을 수 없습니다 — 모노레포에서는 먼저 `pnpm build`를 실행하세요 (배포된 storepulse 패키지에는 포함되어 있습니다)"
  },
  "explain.title": {
    "en": "release states",
    "ko": "릴리즈 상태"
  },
  "explain.legendHint": {
    "en": "storepulse explain <state> shows store states and the recommended action.",
    "ko": "storepulse explain <state> 로 스토어 원본 상태와 권장 액션을 볼 수 있습니다."
  },
  "explain.meaning": {
    "en": "meaning",
    "ko": "의미"
  },
  "explain.rawStates": {
    "en": "store states",
    "ko": "스토어 원본 상태"
  },
  "explain.action": {
    "en": "recommended action",
    "ko": "권장 액션"
  },
  "explain.unknownState": {
    "en": "unknown state \"{state}\" — available states:",
    "ko": "\"{state}\"은(는) 알 수 없는 상태입니다 — 사용 가능한 상태:"
  },
  "dash.loading": {
    "en": "loading status.json…",
    "ko": "status.json 불러오는 중…"
  },
  "dash.noData": {
    "en": "· no data",
    "ko": "· 데이터 없음"
  },
  "dash.retrying": {
    "en": "retrying every {seconds}s",
    "ko": "{seconds}초마다 재시도"
  },
  "dash.loadErrorTitle": {
    "en": "could not load {url}",
    "ko": "{url}을(를) 불러오지 못했습니다"
  },
  "dash.loadErrorServe": {
    "en": "serve mode: check the terminal running `storepulse serve`.",
    "ko": "serve 모드: `storepulse serve`를 실행 중인 터미널을 확인하세요."
  },
  "dash.loadErrorStatic": {
    "en": "static mode: generate a snapshot with `storepulse snapshot --demo --out status.json` and place it next to index.html.",
    "ko": "static 모드: `storepulse snapshot --demo --out status.json` 으로 스냅샷을 만들어 index.html 옆에 두세요."
  },
  "dash.emptyTitle": {
    "en": "no apps in this snapshot",
    "ko": "스냅샷에 앱이 없습니다"
  },
  "dash.emptyBody": {
    "en": "add apps to `storepulse.config.json` and regenerate.",
    "ko": "`storepulse.config.json`에 앱을 추가하고 다시 생성하세요."
  },
  "dash.schemaWarnTitle": {
    "en": "snapshot schemaVersion {version}",
    "ko": "스냅샷 schemaVersion {version}"
  },
  "dash.schemaWarnBody": {
    "en": "this dashboard understands version {supported} — rendering best-effort.",
    "ko": "이 대시보드는 버전 {supported}을 이해합니다 — 가능한 범위에서 렌더링합니다."
  },
  "dash.filterEmpty": {
    "en": "no apps match the current filter",
    "ko": "현재 필터에 맞는 앱이 없습니다"
  },
  "dash.filterAll": {
    "en": "All",
    "ko": "전체"
  },
  "dash.filterOs": {
    "en": "os",
    "ko": "OS"
  },
  "dash.filterGroup": {
    "en": "group",
    "ko": "그룹"
  },
  "dash.filterByOs": {
    "en": "filter by os",
    "ko": "OS 필터"
  },
  "dash.filterByGroup": {
    "en": "filter by group",
    "ko": "그룹 필터"
  },
  "dash.targets": {
    "en": "{n} targets",
    "ko": "타깃 {n}개"
  },
  "dash.targetsFiltered": {
    "en": "{shown}/{total} targets",
    "ko": "타깃 {shown}/{total}개"
  },
  "dash.autoRefresh": {
    "en": "auto-refresh {seconds}s",
    "ko": "자동 새로고침 {seconds}초"
  },
  "dash.rowDetails": {
    "en": "{name} {os} details",
    "ko": "{name} {os} 상세"
  },
  "dash.expired": {
    "en": "EXPIRED ({date})",
    "ko": "만료됨 ({date})"
  },
  "dash.kvDate": {
    "en": "date",
    "ko": "날짜"
  },
  "dash.kvExpires": {
    "en": "expires",
    "ko": "만료"
  },
  "dash.kvBuild": {
    "en": "build",
    "ko": "빌드"
  },
  "dash.kvState": {
    "en": "state",
    "ko": "상태"
  },
  "dash.kvRollout": {
    "en": "rollout",
    "ko": "롤아웃"
  },
  "dash.langLabel": {
    "en": "language",
    "ko": "언어"
  },
  "dash.explainBadge": {
    "en": "explain {badge}",
    "ko": "{badge} 설명"
  },
  "dash.explainClose": {
    "en": "close",
    "ko": "닫기"
  }
};
