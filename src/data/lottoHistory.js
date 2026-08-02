/**
 * 로또 6/45 역대 당첨번호 데이터
 *
 * 동행복권 API가 해외 IP 또는 특정 조건에서 차단되는 경우를 대비한
 * 폴백 데이터입니다. src/data/lottoHistory.json 파일에서
 * 1회차부터 최신 회차까지의 전체 당첨번호를 로드합니다.
 *
 * 데이터 출처: 동행복권 (dhlottery.co.kr)
 * 수집 스크립트: scripts/fetchLottoHistory.mjs
 */

import lottoHistoryJson from "./lottoHistory.json";

/**
 * 역대 당첨번호 목록 (1회차부터 최신 회차까지, 오래된 순)
 * JSON 파일의 draws 배열을 그대로 사용합니다.
 */
export const lottoHistoryData = lottoHistoryJson.draws;

/**
 * 역대 당첨번호 메타 정보
 */
export const lottoHistoryMeta = lottoHistoryJson.meta;

/**
 * 정적 데이터에서 당첨번호를 가져옵니다.
 * @param {number} drawNo - 회차 번호
 * @returns {Object|null} 당첨번호 정보 또는 null
 */
export function getLottoFromStaticData(drawNo) {
  return lottoHistoryData.find((item) => item.drawNo === drawNo) || null;
}

/**
 * 정적 데이터에서 최근 N회차의 당첨번호를 가져옵니다.
 * @param {number} count - 가져올 회차 수
 * @returns {Array} 당첨번호 목록 (최신 회차부터)
 */
export function getRecentLottoFromStaticData(count = 10) {
  // 최신 회차가 배열의 끝에 있으므로 뒤에서부터 slice
  return lottoHistoryData.slice(-count).reverse();
}
