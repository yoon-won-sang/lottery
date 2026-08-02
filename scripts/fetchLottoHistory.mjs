/**
 * 역대 로또 6/45 당첨번호 수집 스크립트
 *
 * 동행복권의 selectPstLt645InfoNew.do 엔드포인트를 사용하여
 * 1회차부터 최신 회차까지 모든 당첨번호를 가져와
 * src/data/lottoHistory.json 파일로 저장합니다.
 *
 * 사용법: node scripts/fetchLottoHistory.mjs
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, "../src/data/lottoHistory.json");

const ENDPOINT = "https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do";
const HEADERS = {
  accept: "application/json, text/html;q=0.9",
  "user-agent": "k-skill/k-lotto",
};

/**
 * YYYYMMDD -> YYYY-MM-DD
 */
function formatYmd(raw) {
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

/**
 * 특정 회차 범위의 당첨번호를 가져옵니다.
 * srchLtEpsd=N 으로 요청하면 N회차를 포함해 최신 회차부터 10개를 반환합니다.
 * @param {number} epsd - 기준 회차
 * @returns {Promise<Array>} 당첨번호 목록
 */
async function fetchBatch(epsd) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("srchDir", "center");
  url.searchParams.set("srchLtEpsd", String(epsd));

  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status} (epsd=${epsd})`);
  }

  const payload = await response.json();
  const list = payload?.data?.list;

  if (!Array.isArray(list)) {
    throw new Error(`응답에 data.list가 없습니다 (epsd=${epsd})`);
  }

  return list.map((item) => ({
    drawNo: Number(item.ltEpsd),
    drawDate: formatYmd(String(item.ltRflYmd)),
    numbers: [
      Number(item.tm1WnNo),
      Number(item.tm2WnNo),
      Number(item.tm3WnNo),
      Number(item.tm4WnNo),
      Number(item.tm5WnNo),
      Number(item.tm6WnNo),
    ],
    bonus: Number(item.bnsWnNo),
    totalSales: Number(item.wholEpsdSumNtslAmt),
    firstPrize: Number(item.rnk1SumWnAmt),
    firstWinners: Number(item.rnk1WnNope),
  }));
}

/**
 * 대략적인 최신 회차 번호를 계산합니다.
 * 2002-12-07 1회차 시작, 매주 토요일 1회씩 증가.
 */
function estimateLatestRound() {
  const firstDrawDate = new Date("2002-12-07");
  const now = new Date();
  const weeksDiff = Math.floor(
    (now - firstDrawDate) / (1000 * 60 * 60 * 24 * 7),
  );
  return weeksDiff + 1;
}

/**
 * 최신 회차 번호를 가져옵니다.
 * 대략적인 회차로 요청한 뒤, 반환된 목록에서 가장 큰 회차를 사용합니다.
 * 추정치가 실제보다 크면 빈 리스트가 반환되므로, 작아질 때까지 시도합니다.
 */
async function getLatestRound() {
  let estimate = estimateLatestRound();

  // 추정치가 너무 크면 빈 리스트가 반환되므로 10씩 줄여가며 시도
  for (let attempt = 0; attempt < 20; attempt++) {
    const batch = await fetchBatch(estimate);
    if (batch.length > 0) {
      return Math.max(...batch.map((b) => b.drawNo));
    }
    estimate -= 10;
  }

  throw new Error("최신 회차를 찾을 수 없습니다.");
}

async function main() {
  console.log("🔄 최신 회차 확인 중...");
  const latestRound = await getLatestRound();
  console.log(`✅ 최신 회차: ${latestRound}회`);

  const allResults = new Map();

  // 10개씩 가져오기 위해 epsd를 1, 11, 21, 31... 형태로 증가
  // srchLtEpsd=N 은 N을 포함해 최신부터 10개를 반환하므로,
  // N=1이면 10~1, N=11이면 20~11, N=21이면 30~21 ... 반환
  for (let epsd = 1; epsd <= latestRound; epsd += 10) {
    const batch = await fetchBatch(epsd);

    for (const item of batch) {
      // 최신 회차까지만 저장 (초과분 제외)
      if (item.drawNo >= 1 && item.drawNo <= latestRound) {
        allResults.set(item.drawNo, item);
      }
    }

    const maxRound = Math.max(...batch.map((b) => b.drawNo));
    const minRound = Math.min(...batch.map((b) => b.drawNo));
    console.log(
      `  📥 ${epsd}회 기준 요청: ${minRound}~${maxRound}회 (${batch.length}개) - 누적 ${allResults.size}개`,
    );

    // 서버 부하 방지
    await new Promise((r) => setTimeout(r, 200));
  }

  // 회차 순으로 정렬 (오래된 것부터)
  const sorted = [...allResults.values()].sort((a, b) => a.drawNo - b.drawNo);

  console.log(`\n✅ 총 ${sorted.length}회차 수집 완료`);
  console.log(
    `   범위: ${sorted[0].drawNo}회 ~ ${sorted[sorted.length - 1].drawNo}회`,
  );

  // 누락 회차 확인
  const missing = [];
  for (let i = 1; i <= latestRound; i++) {
    if (!allResults.has(i)) missing.push(i);
  }
  if (missing.length > 0) {
    console.log(`⚠️  누락된 회차 ${missing.length}개: ${missing.join(", ")}`);
  } else {
    console.log("✅ 누락된 회차 없음");
  }

  const output = {
    meta: {
      source: "동행복권 (dhlottery.co.kr)",
      endpoint: "/lt645/selectPstLt645InfoNew.do",
      lastUpdated: new Date().toISOString(),
      latestRound,
      totalRounds: sorted.length,
    },
    draws: sorted,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n💾 저장 완료: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("❌ 오류:", err);
  process.exitCode = 1;
});
