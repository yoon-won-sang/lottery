/**
 * 동행복권 당첨번호 API
 *
 * 동행복권에서 제공하는 공식 API를 사용하여 회차별 당첨번호를 가져옵니다.
 * CORS 문제로 인해 Vite 프록시를 통해 호출합니다.
 *
 * API 엔드포인트:
 *   GET /api/dhlottery/common.do?method=getLottoNumber&drwNo={회차번호}
 *
 * 주의: 동행복권 서버는 한국 IP에서만 정상 응답합니다.
 *       해외 IP에서는 302 리다이렉트가 발생할 수 있으며,
 *       이 경우 정적 폴백 데이터를 사용합니다.
 */

import {
  lottoHistoryData,
  getLottoFromStaticData,
  getRecentLottoFromStaticData,
} from "../data/lottoHistory.js";

/**
 * 특정 회차의 당첨번호를 가져옵니다.
 * API 호출이 실패하면 정적 데이터에서 가져옵니다.
 * @param {number} drawNo - 회차 번호 (예: 1100)
 * @returns {Promise<Object>} 당첨번호 정보
 */
export async function fetchLottoNumber(drawNo) {
  try {
    const url = `/api/dhlottery/common.do?method=getLottoNumber&drwNo=${drawNo}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    // 리다이렉트 또는 에러 확인
    if (!response.ok) {
      throw new Error(`API 응답 오류: ${response.status}`);
    }

    const data = await response.json();

    if (data.returnValue !== "success") {
      throw new Error(`회차 ${drawNo}의 당첨번호를 가져오지 못했습니다.`);
    }

    return {
      drawNo: data.drwNo,
      drawDate: data.drwNoDate,
      numbers: [
        data.drwtNo1,
        data.drwtNo2,
        data.drwtNo3,
        data.drwtNo4,
        data.drwtNo5,
        data.drwtNo6,
      ],
      bonus: data.bnusNo,
      totalSales: data.totSellamnt,
      firstPrize: data.firstWinamnt,
      firstWinners: data.firstPrzwnerCo,
      source: "api",
    };
  } catch (error) {
    // API 호출 실패 시 정적 데이터에서 가져오기
    const staticData = getLottoFromStaticData(drawNo);
    if (staticData) {
      return {
        ...staticData,
        source: "static",
      };
    }
    throw new Error(
      `회차 ${drawNo}의 당첨번호를 가져올 수 없습니다. (API 차단 및 정적 데이터 없음)`,
    );
  }
}

/**
 * 최신 회차 번호를 가져옵니다.
 * 동행복권은 매주 토요일 추첨하므로, 대략적인 최신 회차를 계산합니다.
 * 2002년 12월 1일 1회차 시작, 매주 1회씩 증가
 * @returns {number} 최신 회차 번호
 */
export function getLatestDrawNo() {
  const firstDrawDate = new Date("2002-12-01");
  const now = new Date();

  // 주 단위로 계산 (7일 = 1회차)
  const weeksDiff = Math.floor(
    (now - firstDrawDate) / (1000 * 60 * 60 * 24 * 7),
  );

  // 토요일 추첨이므로, 이번 주 토요일이 지났는지 확인
  const dayOfWeek = now.getDay(); // 0=일, 6=토
  if (dayOfWeek >= 6 && now.getHours() >= 21) {
    // 토요일 9시 이후면 이번 회차 추첨 완료
    return weeksDiff + 1;
  }

  return weeksDiff + 1;
}

/**
 * 여러 회차의 당첨번호를 가져옵니다.
 * API 호출이 실패하면 정적 데이터에서 가져옵니다.
 * @param {number} startNo - 시작 회차
 * @param {number} count - 가져올 회차 수
 * @returns {Promise<Array>} 당첨번호 목록
 */
export async function fetchLottoNumbers(startNo, count = 10) {
  try {
    const promises = [];
    for (let i = 0; i < count; i++) {
      const drawNo = startNo - i;
      if (drawNo < 1) break;
      promises.push(fetchLottoNumber(drawNo));
    }

    const results = await Promise.allSettled(promises);
    const successResults = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);

    // API에서 일부라도 가져왔으면 반환
    if (successResults.length > 0) {
      return successResults;
    }

    // API 전체 실패 시 정적 데이터 사용
    throw new Error("API 전체 실패");
  } catch {
    // 정적 데이터에서 가져오기
    return getRecentLottoFromStaticData(count).map((item) => ({
      ...item,
      source: "static",
    }));
  }
}
