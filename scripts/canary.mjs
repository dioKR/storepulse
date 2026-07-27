#!/usr/bin/env node
/**
 * 3층 — 카나리 스모크 테스트.
 *
 * storepulse.config.canary.json(시크릿 CANARY_CONFIG_BASE64로 주입)의 앱을
 * 실제 스토어 API로 조회한 뒤, 커넥터가 돌려준 응답의 필수 필드를 검증한다.
 * 상태가 "unknown"으로 떨어지거나 채널이 비면 업스트림 API 변경 신호로 보고
 * 종료 코드 1로 실패한다 — canary.yml이 이를 받아 이슈를 만든다.
 *
 * 주의: 출력은 그대로 GitHub 이슈에 실린다. 앱 ID(storeId)와 키는
 * 커밋하지 않는 정보이므로 출력 전에 전부 마스킹한다.
 *
 * 사전 조건: pnpm build (packages/core/dist 필요), 환경변수
 *   ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY_BASE64   (ios 앱이 있을 때)
 *   PLAY_SERVICE_ACCOUNT_BASE64                            (android 앱이 있을 때)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AscConnector, fetchAll, GooglePlayConnector } from "../packages/core/dist/index.js";

const CONFIG_PATH = resolve(process.argv[2] ?? "storepulse.config.canary.json");

const KNOWN_CHANNELS = new Set(["production", "beta", "internal"]);
const KNOWN_STATES = new Set([
  "live",
  "rollout",
  "in-review",
  "pending",
  "rejected",
  "halted",
  "draft",
]);

/** 커밋되지 않는 식별자(storeId, key)를 출력에서 가린다. */
function makeMasker(targets) {
  const secrets = targets
    .flatMap((t) => [t.storeId, t.key, t.name])
    .filter((s) => typeof s === "string" && s.length > 0)
    .sort((a, b) => b.length - a.length);
  return (text) => {
    let out = String(text);
    for (const secret of secrets) {
      out = out.split(secret).join("***");
    }
    return out;
  };
}

function loadTargets() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    console.error(`카나리 설정을 읽지 못했습니다 (${CONFIG_PATH}): ${err.message}`);
    process.exit(1);
  }
  const apps = raw.apps;
  if (!Array.isArray(apps) || apps.length === 0) {
    console.error('카나리 설정에 비어 있지 않은 "apps" 배열이 필요합니다.');
    process.exit(1);
  }
  return apps;
}

function fromBase64(name) {
  const value = process.env[name];
  return value ? Buffer.from(value, "base64").toString("utf8") : null;
}

function buildConnectors(targets) {
  const connectors = [];
  if (targets.some((t) => t.platform === "ios")) {
    const { ASC_KEY_ID, ASC_ISSUER_ID } = process.env;
    const privateKey = fromBase64("ASC_PRIVATE_KEY_BASE64");
    if (!ASC_KEY_ID || !ASC_ISSUER_ID || !privateKey) {
      console.error("ios 앱이 설정되어 있지만 ASC_* 시크릿이 없습니다.");
      process.exit(1);
    }
    connectors.push(new AscConnector({ keyId: ASC_KEY_ID, issuerId: ASC_ISSUER_ID, privateKey }));
  }
  if (targets.some((t) => t.platform === "android")) {
    const json = fromBase64("PLAY_SERVICE_ACCOUNT_BASE64");
    if (!json) {
      console.error("android 앱이 설정되어 있지만 PLAY_SERVICE_ACCOUNT_BASE64 시크릿이 없습니다.");
      process.exit(1);
    }
    const parsed = JSON.parse(json);
    if (!parsed.client_email || !parsed.private_key) {
      console.error("PLAY_SERVICE_ACCOUNT JSON에 client_email/private_key가 없습니다.");
      process.exit(1);
    }
    connectors.push(
      new GooglePlayConnector({ clientEmail: parsed.client_email, privateKey: parsed.private_key }),
    );
  }
  return connectors;
}

/** 커넥터가 돌려준 AppStatus의 필수 필드를 검증하고 문제 목록을 반환한다. */
function validate(status, label) {
  const problems = [];
  if (status.error) {
    problems.push(`${label}: 조회 실패 — ${status.error}`);
    return problems;
  }
  if (typeof status.fetchedAt !== "string" || Number.isNaN(Date.parse(status.fetchedAt))) {
    problems.push(`${label}: fetchedAt이 유효한 ISO 타임스탬프가 아님`);
  }
  if (!Array.isArray(status.channels) || status.channels.length === 0) {
    problems.push(`${label}: 채널이 0개 — 응답에서 릴리스 정보를 찾지 못함 (스키마 변경 의심)`);
    return problems;
  }
  for (const [i, ch] of status.channels.entries()) {
    const where = `${label} 채널[${i}]`;
    if (!KNOWN_CHANNELS.has(ch.channel)) {
      problems.push(`${where}: 알 수 없는 channel "${ch.channel}"`);
    }
    if (ch.state === "unknown") {
      problems.push(
        `${where}: state가 "unknown" — 매핑되지 않은 스토어 상태 (rawState: ${ch.rawState ?? "?"})`,
      );
    } else if (!KNOWN_STATES.has(ch.state)) {
      problems.push(`${where}: 알 수 없는 state "${ch.state}"`);
    }
    if (ch.version !== null && typeof ch.version !== "string") {
      problems.push(`${where}: version이 string|null이 아님 (${typeof ch.version})`);
    }
  }
  return problems;
}

const targets = loadTargets();
const mask = makeMasker(targets);
const connectors = buildConnectors(targets);
const statuses = await fetchAll(connectors, targets);

const problems = [];
for (const [i, status] of statuses.entries()) {
  const label = `${status.target.platform} 앱 #${i + 1}`;
  const found = validate(status, label);
  if (found.length === 0) {
    console.log(`OK  ${label}: 채널 ${status.channels.length}개, 필수 필드 검증 통과`);
  }
  problems.push(...found);
}

if (problems.length > 0) {
  console.error("\n카나리 실패 — 업스트림 API 응답이 기대와 다릅니다:");
  for (const p of problems) {
    console.error(`  - ${mask(p)}`);
  }
  process.exit(1);
}
console.log("\n카나리 통과 — 스토어 API 응답 스키마가 기대와 일치합니다.");
