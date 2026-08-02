import { useState, useCallback, useMemo } from "react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "./App.css";
import { fetchLottoNumber } from "./api/lotto.js";
import { lottoHistoryData } from "./data/lottoHistory.js";
import {
  computeAllStats,
  generateAIRecommendedNumbers,
} from "./utils/lottoStats.js";
import { hasSession, clearSession } from "./utils/auth.js";
import Login from "./components/Login.jsx";

// AG Grid 모듈 등록 (v33+ 필수)
ModuleRegistry.registerModules([AllCommunityModule]);

// AG Grid 라이선스 키 등록
// 라이선스 키는 https://www.ag-grid.com/ 에서 구매/발급받은 키를 입력하세요.
// 미등록 시 "AG Grid Trial License" 워터마크가 표시됩니다.
// .env 파일에 VITE_AG_GRID_LICENSE_KEY=라이선스키 형식으로 넣으면 자동 등록됩니다.
const agGridLicenseKey = import.meta.env.VITE_AG_GRID_LICENSE_KEY;
if (agGridLicenseKey) {
  ModuleRegistry.registerLicense(agGridLicenseKey);
}

// 당첨금을 억/만 단위로 포맷
function formatPrize(value) {
  if (!value) return "-";
  const eok = 100000000;
  const man = 10000;
  if (value >= eok) {
    return `${(value / eok).toFixed(1)}억원`;
  }
  if (value >= man) {
    return `${Math.round(value / man)}만원`;
  }
  return `${value.toLocaleString("ko-KR")}원`;
}

function generateLotteryNumbers() {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  const drawn = [];

  while (drawn.length < 6) {
    const idx = Math.floor(Math.random() * pool.length);
    drawn.push(pool.splice(idx, 1)[0]);
  }

  const bonus = pool[Math.floor(Math.random() * pool.length)];

  return {
    main: drawn.sort((a, b) => a - b),
    bonus,
  };
}

// 가중치 기반 번호 생성 (weights: 1~45번 각각의 가중치)
function generateWeightedNumbers(weights) {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  const drawn = [];

  while (drawn.length < 6) {
    // 현재 pool에 있는 번호들의 가중치 합계
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

  // 보너스 번호도 가중치 기반으로 선택
  const bonusTotalWeight = pool.reduce((sum, n) => sum + weights[n], 0);
  let br = Math.random() * bonusTotalWeight;
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

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => hasSession());
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedMode, setSelectedMode] = useState(null);

  // 로그아웃
  const handleLogout = useCallback(() => {
    clearSession();
    setIsAuthenticated(false);
  }, []);

  // 각 생성 방법별 이론 설명
  const modeDescriptions = {
    random: {
      title: "임의 생성 번호",
      icon: "🎲",
      color: "var(--text-muted)",
      desc: "1부터 45까지의 번호 중 6개의 당첨 번호와 1개의 보너스 번호를 완전히 무작위로 추출합니다.",
      theory:
        "각 번호가 선택될 확률은 모두 동일하며(균등분포, Uniform Distribution), 이전 추출 결과가 이후 추출에 영향을 주지 않는 독립시행(Independent Event)입니다. 가장 공정하고 편향이 없는 방법입니다.",
    },
    frequent: {
      title: "많이 나온 번호",
      icon: "🔥",
      color: "var(--primary)",
      desc: "역대 당첨번호에서 출현 빈도가 높은 번호일수록 선택될 확률이 높아지도록 가중치를 부여합니다.",
      theory:
        "대수의 법칙(Law of Large Numbers)에 따라 충분히 많은 시행을 거치면 각 번호의 출현 빈도는 이론적 확률에 수렴합니다. 빈도가 높은 번호는 'Hot Number'로 분류되며, 베이즈 추정(Bayesian Estimation) 관점에서 사전 확률(역대 빈도)을 기반으로 사후 확률을 추정합니다.",
    },
    rare: {
      title: "적게 나온 번호",
      icon: "❄️",
      color: "#f59e0b",
      desc: "역대 당첨번호에서 출현 빈도가 낮은 번호일수록 선택될 확률이 높아지도록 가중치를 부여합니다.",
      theory:
        "평균 회귀(Mean Reversion) 법칙에 따라 장기적으로 모든 번호의 출현 빈도는 평균에 수렴하는 경향이 있습니다. 따라서 상대적으로 적게 나온 번호('Cold Number')는 앞으로 출현 확률이 보정될 가능성이 높다는 가정을 적용합니다.",
    },
    ai: {
      title: "AI 추천 번호",
      icon: "🤖",
      color: "#8b5cf6",
      desc: "8가지 통계 이론을 종합적으로 적용하여 200개의 후보 조합 중 가장 높은 점수의 조합을 추천합니다.",
      theory:
        "① 빈도 분석(대수의 법칙) ② 최근 트렌드(지수 감소 가중치) ③ 쌍 발생 분석(동시 출현 확률) ④ 홀짝 비율(3:3 최적화) ⑤ 합계 분석(정규분포 Z-score) ⑥ 구간 분포(3구간 균등 분포) ⑦ 갭 분석(평균 회귀) ⑧ 연속 번호 패턴(과다 패널티)을 가중합하여 종합 점수를 산출합니다.",
    },
  };

  // 역대 당첨번호의 번호별 출현 빈도 계산 (1~45)
  const numberFrequency = useMemo(() => {
    const freq = Array(46).fill(0); // index 1~45 사용
    lottoHistoryData.forEach((lotto) => {
      lotto.numbers.forEach((n) => {
        freq[n]++;
      });
    });
    return freq;
  }, []);

  // 가중치 배열 생성 (useMemo로 캐싱)
  const weights = useMemo(() => {
    const maxFreq = Math.max(...numberFrequency.slice(1));
    const minFreq = Math.min(...numberFrequency.slice(1));

    // 많이 나온 번호 가중치: 빈도 자체 + 최소값 보장
    const frequentWeights = Array(46).fill(0);
    // 적게 나온 번호 가중치: (maxFreq - 빈도 + 1)
    const rareWeights = Array(46).fill(0);

    for (let i = 1; i <= 45; i++) {
      frequentWeights[i] = numberFrequency[i] + minFreq; // 최소 가중치 보장
      rareWeights[i] = maxFreq - numberFrequency[i] + 1;
    }

    return { frequentWeights, rareWeights };
  }, [numberFrequency]);

  // AI 추천용 통계 데이터 (useMemo로 캐싱)
  const lottoStats = useMemo(() => computeAllStats(lottoHistoryData), []);

  // 번호 생성 (mode: "random" | "frequent" | "rare")
  const handleGenerate = useCallback(
    (mode) => {
      setSelectedMode(mode);
      let newResult;
      let typeLabel;

      if (mode === "frequent") {
        newResult = generateWeightedNumbers(weights.frequentWeights);
        typeLabel = "많이나온번호";
      } else if (mode === "rare") {
        newResult = generateWeightedNumbers(weights.rareWeights);
        typeLabel = "적게나온번호";
      } else if (mode === "ai") {
        newResult = generateAIRecommendedNumbers(lottoStats);
        typeLabel = "AI추천";
      } else {
        newResult = generateLotteryNumbers();
        typeLabel = "임의생성";
      }

      setResult(newResult);
      setHistory((prev) =>
        [
          {
            id: Date.now(),
            ...newResult,
            date: new Date().toLocaleString("ko-KR"),
            type: typeLabel,
          },
          ...prev,
        ].slice(0, 50),
      );
    },
    [weights, lottoStats],
  );

  // 설명 영역 토글 (버튼 재클릭 시 숨김)
  const handleToggleDescription = useCallback((mode) => {
    setSelectedMode((prev) => (prev === mode ? null : mode));
  }, []);

  // 역대 전체 당첨번호 불러오기 (정적 데이터 기반, 최신 회차부터)
  const handleFetchLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 정적 데이터(1~최신 회차)를 최신 순으로 변환
      const allDraws = [...lottoHistoryData].reverse().map((lotto) => ({
        id: `lotto-${lotto.drawNo}`,
        main: lotto.numbers,
        bonus: lotto.bonus,
        date: `${lotto.drawNo}회 (${lotto.drawDate})`,
        type: "실제당첨",
        firstWinners: lotto.firstWinners,
        firstPrize: lotto.firstPrize,
        firstPrizePerWinner:
          lotto.firstWinners > 0
            ? Math.round(lotto.firstPrize / lotto.firstWinners)
            : 0,
      }));

      setHistory(allDraws);
      setResult({
        main: allDraws[0].main,
        bonus: allDraws[0].bonus,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 특정 회차 당첨번호 불러오기
  const [drawNoInput, setDrawNoInput] = useState("");
  const handleFetchByNo = useCallback(async () => {
    const drawNo = parseInt(drawNoInput, 10);
    if (!drawNo || drawNo < 1) {
      setError("올바른 회차 번호를 입력하세요.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const lotto = await fetchLottoNumber(drawNo);
      const newEntry = {
        id: `lotto-${lotto.drawNo}`,
        main: lotto.numbers,
        bonus: lotto.bonus,
        date: `${lotto.drawNo}회 (${lotto.drawDate})`,
        type: "실제당첨",
        firstWinners: lotto.firstWinners,
        firstPrize: lotto.firstPrize,
        firstPrizePerWinner:
          lotto.firstWinners > 0
            ? Math.round(lotto.firstPrize / lotto.firstWinners)
            : 0,
      };

      setHistory((prev) => [newEntry, ...prev].slice(0, 50));
      setResult({
        main: lotto.numbers,
        bonus: lotto.bonus,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [drawNoInput]);

  const columnDefs = [
    {
      headerName: "회차/일시",
      field: "date",
      flex: 1.4,
      minWidth: 180,
      cellStyle: {
        color: "var(--text)",
        fontSize: "14px",
        fontWeight: 500,
      },
    },
    {
      headerName: "1등 번호",
      field: "main",
      flex: 2.2,
      minWidth: 200,
      valueFormatter: (p) => p.value.join(", "),
      cellStyle: {
        color: "var(--primary)",
        fontSize: "15px",
        fontWeight: 700,
        letterSpacing: "0.02em",
        justifyContent: "center",
      },
    },
    {
      headerName: "보너스",
      field: "bonus",
      flex: 0.6,
      minWidth: 70,
      cellStyle: {
        color: "var(--success)",
        fontSize: "16px",
        fontWeight: 800,
        justifyContent: "center",
      },
    },
    {
      headerName: "1등 당첨자",
      field: "firstWinners",
      flex: 0.8,
      minWidth: 90,
      valueFormatter: (p) => (p.value > 0 ? `${p.value}명` : "-"),
      cellStyle: {
        color: "var(--text)",
        fontSize: "14px",
        fontWeight: 600,
        justifyContent: "flex-end",
      },
    },
    {
      headerName: "1등 당첨금",
      field: "firstPrize",
      flex: 1.5,
      minWidth: 130,
      valueFormatter: (p) => formatPrize(p.value),
      cellStyle: {
        color: "var(--primary)",
        fontSize: "14px",
        fontWeight: 700,
        justifyContent: "flex-end",
      },
    },
    {
      headerName: "1등 1인당",
      field: "firstPrizePerWinner",
      flex: 1.5,
      minWidth: 130,
      valueFormatter: (p) => formatPrize(p.value),
      cellStyle: {
        color: "var(--primary)",
        fontSize: "14px",
        fontWeight: 700,
        justifyContent: "flex-end",
      },
    },
    {
      headerName: "구분",
      field: "type",
      flex: 0.8,
      minWidth: 90,
      cellStyle: (params) => {
        const colorMap = {
          실제당첨: "var(--success)",
          임의생성: "var(--text-muted)",
          많이나온번호: "var(--primary)",
          적게나온번호: "#f59e0b",
          AI추천: "#8b5cf6",
        };
        return {
          fontSize: "13px",
          fontWeight: 600,
          color: colorMap[params.value] || "var(--text-muted)",
        };
      },
    },
  ];

  const defaultColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    tooltipValueGetter: (params) => {
      if (params.value == null) return "";
      const formatter = params.colDef.valueFormatter;
      if (formatter) {
        return formatter(params);
      }
      if (Array.isArray(params.value)) return params.value.join(", ");
      return String(params.value);
    },
  };

  // 행 단위 그라데이션을 위한 클래스 규칙
  const rowClassRules = {
    "row-gradient-1": (params) => params.node.rowIndex % 3 === 0,
    "row-gradient-2": (params) => params.node.rowIndex % 3 === 1,
    "row-gradient-3": (params) => params.node.rowIndex % 3 === 2,
  };

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎱 동행복권 번호 생성기</h1>
        <p>1~45 사이의 번호 6개와 보너스 번호를 생성합니다</p>
        <button type="button" className="logout-btn" onClick={handleLogout}>
          로그아웃
        </button>
      </header>

      <div className="controls">
        <button
          type="button"
          className="generate-btn"
          onClick={() => handleGenerate("random")}
          onDoubleClick={() => handleToggleDescription("random")}
          title="더블클릭으로 이론 설명 보기"
        >
          임의 생성 번호
        </button>
        <button
          type="button"
          className="generate-btn"
          onClick={() => handleGenerate("frequent")}
          onDoubleClick={() => handleToggleDescription("frequent")}
          title="더블클릭으로 이론 설명 보기"
        >
          많이 나온 번호
        </button>
        <button
          type="button"
          className="generate-btn"
          onClick={() => handleGenerate("rare")}
          onDoubleClick={() => handleToggleDescription("rare")}
          title="더블클릭으로 이론 설명 보기"
        >
          적게 나온 번호
        </button>
        <button
          type="button"
          className="generate-btn"
          onClick={() => handleGenerate("ai")}
          onDoubleClick={() => handleToggleDescription("ai")}
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          title="더블클릭으로 이론 설명 보기"
        >
          🤖 AI 추천 번호
        </button>
        <button
          type="button"
          className="fetch-btn"
          onClick={handleFetchLatest}
          disabled={loading}
        >
          {loading ? "불러오는 중..." : "최신 당첨번호 불러오기"}
        </button>
      </div>

      {selectedMode && modeDescriptions[selectedMode] && (
        <div
          className="mode-description"
          style={{ borderLeftColor: modeDescriptions[selectedMode].color }}
        >
          <h3 className="mode-description-title">
            <span className="mode-description-icon">
              {modeDescriptions[selectedMode].icon}
            </span>
            {modeDescriptions[selectedMode].title}
          </h3>
          <p className="mode-description-desc">
            {modeDescriptions[selectedMode].desc}
          </p>
          <p className="mode-description-theory">
            <strong>📊 통계 이론:</strong>{" "}
            {modeDescriptions[selectedMode].theory}
          </p>
        </div>
      )}

      <div className="draw-no-input">
        <input
          type="number"
          placeholder="회차 번호 (예: 1100)"
          value={drawNoInput}
          onChange={(e) => setDrawNoInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFetchByNo()}
        />
        <button type="button" onClick={handleFetchByNo} disabled={loading}>
          특정 회차 불러오기
        </button>
      </div>

      {error && <p className="error-message">{error}</p>}

      {result && (
        <div className="lottery-result">
          <div className="numbers">
            {result.main.map((n) => (
              <span key={n} className="ball">
                {n}
              </span>
            ))}
          </div>
          <p className="bonus-label">
            보너스: <span className="ball bonus">{result.bonus}</span>
          </p>
        </div>
      )}

      <section className="history-section">
        <h2>생성 기록</h2>
        <div className="ag-theme-quartz">
          <AgGridReact
            rowData={history}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            rowClassRules={rowClassRules}
            rowHeight={48}
            pagination={true}
            paginationPageSize={20}
            paginationPageSizeSelector={[10, 20, 50, 100]}
            enableBrowserTooltips={true}
            tooltipShowDelay={300}
          />
        </div>
      </section>
    </div>
  );
}
