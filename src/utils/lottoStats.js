/**
 * 로또 번호 통계 분석 및 AI 추천 번호 생성
 *
 * 적용된 통계 이론:
 * 1. 빈도 분석 (Frequency Analysis) — 역대 출현 빈도 기반 가중치
 * 2. 최근 트렌드 가중치 (Recent Trend Weighting) — 지수 감소 가중치로 최근 추세 반영
 * 3. 쌍 발생 분석 (Pair Co-occurrence Analysis) — 번호 쌍의 동시 출현 확률
 * 4. 홀짝 비율 (Odd/Even Ratio) — 통계적 최적 비율(3:3) 기반 점수
 * 5. 합계 분석 (Sum Analysis) — 정규분포(Normal Distribution) 기반 합계 범위 적합도
 * 6. 구간 분포 (Number Group Distribution) — 3구간(1-15, 16-30, 31-45) 균등 분포
 * 7. 갭 분석 (Gap Analysis) — 평균 회귀 법칙(Law of Large Numbers) 적용
 * 8. 연속 번호 패턴 (Consecutive Number Pattern) — 연속 번호 과다 패널티
 *
 * 참고 통계 이론:
 * - 대수의 법칙 (Law of Large Numbers): 충분한 표본으로 확률 수렴
 * - 평균 회귀 (Mean Reversion): 장기적으로 평균에 수렴하는 경향
 * - 정규분포 (Normal Distribution): 합계의 분포가 정규분포를 따름
 * - 베이즈 추정 (Bayesian Estimation): 사전 확률(빈도)을 관측 데이터로 갱신
 * - 마르코프 체인 (Markov Chain): 이전 상태(출현)가 다음 상태에 영향
 */

/**
 * 전체 출현 빈도 계산 (1~45번 각각)
 * @param {Array} draws - 역대 당첨번호 배열
 * @returns {Array} 1~45번 인덱스의 출현 횟수 배열
 */
export function computeFrequency(draws) {
  const freq = Array(46).fill(0);
  draws.forEach((draw) => {
    draw.numbers.forEach((n) => freq[n]++);
  });
  return freq;
}

/**
 * 최근 N회 출현 빈도 (최근 트렌드 분석용)
 * 최근 데이터에 더 높은 가중치를 부여하기 위해 지수 감소 적용
 * @param {Array} draws - 역대 당첨번호 배열
 * @param {number} recentCount - 최근 몇 회까지 분석할지 (기본 50)
 * @returns {Array} 가중치가 적용된 최근 빈도 배열
 */
export function computeRecentFrequency(draws, recentCount = 50) {
  const recent = draws.slice(-recentCount);
  const freq = Array(46).fill(0);
  const totalRecent = recent.length;

  // 지수 감소 가중치: 최근 회차일수록 높은 가중치
  recent.forEach((draw, idx) => {
    const weight = Math.exp((idx / totalRecent) * 2); // 1 ~ e^2 ≈ 7.39
    draw.numbers.forEach((n) => {
      freq[n] += weight;
    });
  });
  return freq;
}

/**
 * 번호 쌍 동시 출현 행렬 (Pair Co-occurrence Matrix)
 * 두 번호가 같은 회차에서 함께 출현한 횟수를 계산
 * @param {Array} draws - 역대 당첨번호 배열
 * @returns {Array} 46x46 행렬 (matrix[i][j] = i와 j가 함께 출현한 횟수)
 */
export function computePairMatrix(draws) {
  const matrix = Array(46)
    .fill(null)
    .map(() => Array(46).fill(0));
  draws.forEach((draw) => {
    const nums = draw.numbers;
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        matrix[nums[i]][nums[j]]++;
        matrix[nums[j]][nums[i]]++;
      }
    }
  });
  return matrix;
}

/**
 * 합계 통계 (평균, 표준편차, 최소, 최대)
 * 6개 번호의 합계 분포가 정규분포를 따른다는 가정
 * @param {Array} draws - 역대 당첨번호 배열
 * @returns {Object} { mean, stdDev, min, max }
 */
export function computeSumStats(draws) {
  const sums = draws.map((d) => d.numbers.reduce((a, b) => a + b, 0));
  const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
  const variance =
    sums.reduce((acc, s) => acc + (s - mean) ** 2, 0) / sums.length;
  const stdDev = Math.sqrt(variance);
  return {
    mean,
    stdDev,
    min: Math.min(...sums),
    max: Math.max(...sums),
  };
}

/**
 * 갭 분석 (Gap Analysis)
 * 각 번호의 마지막 출현 이후 경과된 회차 수
 * 평균 회귀 법칙에 따라 오랫동안 안 나온 번호는 출현 확률이 높아진다는 가정
 * @param {Array} draws - 역대 당첨번호 배열
 * @returns {Array} 1~45번의 갭(경과 회차 수) 배열
 */
export function computeGaps(draws) {
  const gaps = Array(46).fill(draws.length);
  for (let i = draws.length - 1; i >= 0; i--) {
    draws[i].numbers.forEach((n) => {
      if (gaps[n] === draws.length) {
        gaps[n] = draws.length - 1 - i;
      }
    });
  }
  return gaps;
}

/**
 * 후보 번호 조합의 통계적 점수 계산
 * 여러 통계 기준을 가중합하여 종합 점수 산출
 * @param {Array} main - 6개 번호 배열 (정렬됨)
 * @param {Object} stats - 통계 데이터 객체
 * @returns {number} 종합 점수 (높을수록 통계적으로 유리)
 */
function scoreCandidate(main, stats) {
  let score = 0;

  const { frequency, recentFreq, pairMatrix, sumStats, gaps, totalDraws } =
    stats;

  // 1. 합계 적합도 (정규분포 Z-score 기반)
  // 합계가 역대 평균에 가까울수록 높은 점수
  const sum = main.reduce((a, b) => a + b, 0);
  const sumZScore = Math.exp(
    -((sum - sumStats.mean) ** 2) / (2 * sumStats.stdDev ** 2),
  );
  score += sumZScore * 30;

  // 2. 홀짝 비율 (3:3이 통계적으로 가장 많이 출현)
  const oddCount = main.filter((n) => n % 2 === 1).length;
  const oddEvenScore = 1 - Math.abs(oddCount - 3) / 3;
  score += oddEvenScore * 20;

  // 3. 구간 분포 (1-15, 16-30, 31-45 각 2개씩이 ideal)
  const groups = [0, 0, 0];
  main.forEach((n) => {
    if (n <= 15) groups[0]++;
    else if (n <= 30) groups[1]++;
    else groups[2]++;
  });
  const groupScore =
    1 -
    (Math.abs(groups[0] - 2) +
      Math.abs(groups[1] - 2) +
      Math.abs(groups[2] - 2)) /
      6;
  score += groupScore * 20;

  // 4. 쌍 발생 빈도 (함께 자주 나온 번호쌍 보너스)
  let pairScore = 0;
  for (let i = 0; i < main.length; i++) {
    for (let j = i + 1; j < main.length; j++) {
      pairScore += pairMatrix[main[i]][main[j]];
    }
  }
  // 정규화: 예상 평균 쌍 빈도 = totalDraws * C(6,2) / C(45,2)
  const expectedPairFreq = (totalDraws * 15) / 990;
  score += Math.min(pairScore / (expectedPairFreq * 15), 2) * 15;

  // 5. 전체 빈도 가중치 (자주 나온 번호 보너스)
  let freqScore = 0;
  main.forEach((n) => {
    freqScore += frequency[n];
  });
  const avgFreq = (totalDraws * 6) / 45;
  score += Math.min(freqScore / (avgFreq * 6), 2) * 10;

  // 6. 최근 트렌드 (최근에 자주 나온 번호 보너스 — Hot Number)
  let recentScore = 0;
  main.forEach((n) => {
    recentScore += recentFreq[n];
  });
  const avgRecentFreq = (50 * 6) / 45;
  score += Math.min(recentScore / (avgRecentFreq * 6), 2) * 10;

  // 7. 갭 분석 (오랫동안 안 나온 번호 보너스 — 평균 회귀)
  let gapScore = 0;
  main.forEach((n) => {
    gapScore += gaps[n];
  });
  const avgGap = (totalDraws * 6) / 45;
  score += Math.min(gapScore / (avgGap * 6), 2) * 5;

  // 8. 연속 번호 패널티 (연속 번호가 2쌍 이상이면 감점)
  let consecutiveCount = 0;
  for (let i = 0; i < main.length - 1; i++) {
    if (main[i + 1] - main[i] === 1) consecutiveCount++;
  }
  if (consecutiveCount > 2) {
    score -= (consecutiveCount - 2) * 10;
  }

  return score;
}

/**
 * 가중치 기반 번호 생성 (내부 사용)
 */
function generateWeighted(weights) {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  const drawn = [];

  while (drawn.length < 6) {
    const totalWeight = pool.reduce((sum, n) => sum + weights[n], 0);
    let r = Math.random() * totalWeight;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[pool[i]];
      if (r <= 0) {
        drawn.push(pool.splice(i, 1)[0]);
        break;
      }
    }
  }

  // 보너스 번호
  const bonusTotal = pool.reduce((sum, n) => sum + weights[n], 0);
  let br = Math.random() * bonusTotal;
  let bonus = pool[0];
  for (let i = 0; i < pool.length; i++) {
    br -= weights[pool[i]];
    if (br <= 0) {
      bonus = pool[i];
      break;
    }
  }

  return {
    main: drawn.sort((a, b) => a - b),
    bonus,
  };
}

/**
 * AI 추천 번호 생성 (통계적 점수 기반 최적 선택)
 *
 * 알고리즘:
 * 1. 전체 빈도, 최근 트렌드, 갭 분석을 결합한 가중치로 후보 생성
 * 2. 200개의 후보 조합을 생성
 * 3. 각 후보를 8가지 통계 기준으로 점수 평가
 * 4. 가장 높은 점수의 조합을 추천 번호로 반환
 *
 * @param {Object} stats - computeAllStats() 결과
 * @returns {Object} { main, bonus, score } — 추천 번호와 점수
 */
export function generateAIRecommendedNumbers(stats) {
  const { frequency, recentFreq, gaps } = stats;

  // 결합 가중치: 전체 빈도(40%) + 최근 트렌드(40%) + 갭 보너스(20%)
  const combinedWeights = Array(46).fill(0);
  const maxFreq = Math.max(...frequency.slice(1)) || 1;
  const maxRecent = Math.max(...recentFreq.slice(1)) || 1;
  const maxGap = Math.max(...gaps.slice(1)) || 1;

  for (let i = 1; i <= 45; i++) {
    const freqWeight = frequency[i] / maxFreq;
    const recentWeight = recentFreq[i] / maxRecent;
    const gapWeight = gaps[i] / maxGap;
    // 최소 가중치 0.1 보장 (모든 번호에 출현 기회 부여)
    combinedWeights[i] =
      freqWeight * 0.4 + recentWeight * 0.4 + gapWeight * 0.2 + 0.1;
  }

  // 여러 후보 생성 후 최고 점수 선택
  const NUM_CANDIDATES = 200;
  let bestCandidate = null;
  let bestScore = -Infinity;

  for (let i = 0; i < NUM_CANDIDATES; i++) {
    const candidate = generateWeighted(combinedWeights);
    const score = scoreCandidate(candidate.main, stats);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return { ...bestCandidate, score: bestScore };
}

/**
 * 모든 통계 데이터를 한 번에 계산
 * @param {Array} draws - 역대 당첨번호 배열
 * @returns {Object} 모든 통계 데이터
 */
export function computeAllStats(draws) {
  return {
    frequency: computeFrequency(draws),
    recentFreq: computeRecentFrequency(draws, 50),
    pairMatrix: computePairMatrix(draws),
    sumStats: computeSumStats(draws),
    gaps: computeGaps(draws),
    totalDraws: draws.length,
  };
}
