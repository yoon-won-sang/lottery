// 🔐 인증 유틸리티
// 아이디/비밀번호를 SHA-256 기반 다중 라운드 해시로 변환하여 비교합니다.
// 소스코드에는 해시 값만 존재하므로 원본 값을 직접 노출하지 않습니다.
//
// 검증 알고리즘:
//   1차: SHA-256(salt + 입력값 + salt)
//   2~4차: SHA-256(이전 해시 + 라운드 키)
// 최종 해시가 저장된 해시와 일치해야 인증 성공

const SALT_A = "L0tt0ry@";
const SALT_B = "#Salt2024";
const SALT_C = "::r";
const ROUNDS = 4;

// 문자열 → SHA-256 해시 (Web Crypto API)
async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// 입력값을 다중 라운드 해시로 변환 (서버 없이 클라이언트에서 동일하게 재현)
export async function hashCredential(input) {
  let h = await sha256Hex(SALT_A + input + SALT_B);
  for (let i = 1; i <= ROUNDS; i++) {
    h = await sha256Hex(h + SALT_C + i);
  }
  return h;
}

// 저장된 해시 (원본 아이디/비밀번호는 어디에도 노출되지 않음)
// 4라운드 SHA-256 해시 기준
const STORED_USER_HASH =
  "d9e6c98c242f87d1e61004da02ac2d596f060664563b4d15763cc2da5bfbd954";
const STORED_PASS_HASH =
  "8b5cf1c65417ef6a131738dc9921eb2e4d19c545696fce26ad543ca12371d089";
const SESSION_KEY = "lotto_auth_session_v1";

// 로그인 검증
export async function verifyLogin(username, password) {
  const [userHash, passHash] = await Promise.all([
    hashCredential(username),
    hashCredential(password),
  ]);
  return userHash === STORED_USER_HASH && passHash === STORED_PASS_HASH;
}

// 세션 저장/확인/해제
export function saveSession() {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  sessionStorage.setItem(SESSION_KEY, token);
}

export function hasSession() {
  return Boolean(sessionStorage.getItem(SESSION_KEY));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
