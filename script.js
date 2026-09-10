// ===========================================================================
// 복무왕 — 상태 / 데이터
// ===========================================================================

const TABS = [
  { key: "search", label: "한 줄 답" },
  { key: "chat", label: "챗봇" },
  { key: "notebook", label: "노트북" },
];

// 검색어·키워드가 없을 때 첫 화면에 보여줄 대표 규정 (신규 공무원이 가장 자주 찾는 것)
const REPRESENTATIVE_IDS = [
  "leave_annual_calc",
  "leave_sick_leave",
  "leave_special_family",
  "flex_types_overview",
  "disc_drunk_driving_table",
];

// 검색창 아래 자주 쓰는 키워드 — 누르면 그 낱말로 바로 찾습니다.
const CHIPS = [
  "연가", "병가", "공가", "당직", "비상근무", "유연근무", "재택근무",
  "초과근무", "대체휴무", "출장", "겸직", "외부강의", "음주운전", "징계",
  "경조사", "배우자 출산", "육아시간", "모성보호시간", "공무원증", "복종의무",
];

// 한 화면에 먼저 보여줄 개수 — 나머지는 "더보기"로 펼칩니다.
const LIST_LIMIT = 5;

// 규정검색·챗봇으로 안 풀리는 질문을 이어서 묻는 Google Notebook
// (국가공무원 복무·징계 관련 예규 전문을 소스로 올려 둔 노트북)
const NOTEBOOK_URL = "https://notebook.google.com/notebook/2dbc1d19-7590-4499-927a-55c4e03b5aa3?authuser=1";

// 노트북 화면에서 내려받는 근거 원문 (book/ 폴더)
const REFERENCE_SOURCES = [
  {
    title: "국가공무원 복무·징계 관련 예규",
    meta: "인사혁신처 예규 제213호 · 2026. 6. 23. 시행 · PDF 8.1MB",
    file: "국가공무원 복무·징계 관련 예규.pdf",
    kind: "PDF ↓",
  },
];

const EXAMPLE_QUESTIONS = [
  "군 복무기간이 있으면 신규 연가가 며칠 늘어나나요?",
  "당직 다음 날 대체휴무는 언제까지 써야 하나요?",
];

const state = {
  screen: "intro", // intro | search | detail | chat | notebook
  query: "",
  regulations: [],
  scenarios: [],
  categories: [],
  current: null,      // 상세로 연 규정
  chatMessages: [],    // { role: 'bot'|'user', ...BotResponse 또는 { text } }
  chatDraft: "",
  notebookQuestion: "",
};

function esc(str) {
  return String(str == null ? "" : str).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function nl2br(str) {
  return esc(str).replace(/\n/g, "<br />");
}

// regulations.json은 앱 안에 함께 들어 있어 네트워크 없이 즉시 읽힙니다.
async function loadData() {
  try {
    const res = await fetch("regulations.json");
    const data = await res.json();
    state.regulations = data.regulations || [];
    state.scenarios = data.scenarios || [];
    state.categories = data.categories || [];
  } catch (err) {
    console.warn("규정 데이터를 읽지 못했습니다.", err);
  }
  if (state.screen === "search") render();
}

function categoryOf(key) {
  return state.categories.find((c) => c.key === key);
}

function matchRegulations(query, category) {
  const q = (query || "").trim();
  return state.regulations.filter((r) => {
    const inCategory = !category || category === "ALL" || r.category === category;
    if (!inCategory) return false;
    if (!q) return true;
    return (
      r.title.includes(q) ||
      r.shortSummary.includes(q) ||
      r.tags.some((t) => t.includes(q) || q.includes(t))
    );
  });
}

// 시나리오는 tags가 없어 상황·판정·규칙 텍스트에 검색어가 들어있는지로 매칭합니다.
function matchScenarios(query) {
  const q = (query || "").trim();
  if (!q) return [];
  return state.scenarios.filter((s) => {
    const hay = `${s.situation} ${s.verdictText} ${s.ruleSummary} ${s.exceptionNote || ""} ${s.legalArticle || ""}`;
    return hay.includes(q);
  });
}

// ===========================================================================
// 오프라인 챗봇 엔진 — OfflineChatEngine.kt 를 그대로 이식
// ===========================================================================

function cleanQuery(q) {
  return String(q || "").trim().toLowerCase().replace(/[?!.,]/g, "");
}

function has(clean, ...words) {
  return words.some((w) => clean.includes(w));
}

function answerQuery(query) {
  const clean = cleanQuery(query);

  // Rule 1: 당직 & 유연근무 / 시차출퇴근
  if (has(clean, "당직", "숙직", "일직") && has(clean, "유연", "시차", "조기퇴근", "퇴근", "출근", "단축")) {
    return {
      verdict: "❌ 불가능 (당직 당일 유연근무 원칙적 제한)",
      text:
        "당직근무(일직·숙직) 당일에는 유연근무(시차출퇴근형, 근무시간선택형 등) 적용이 원칙적으로 제한됩니다.\n\n" +
        "■ 사유: 정상 근무시간 종료 전후에 빈틈없는 업무 인계인수와 비상대비태세 유지를 위해 당직 당일에는 정상근무(09:00~18:00) 체제를 유지해야 합니다.\n" +
        "■ 주의: 08시 출근 후 17시 퇴근하여 1시간 공백 후 18시에 숙직 복귀하는 것은 근무공백 규정 위반에 해당합니다.",
      legalBasis: "국가공무원 복무·징계 예규 제2장(유연근무제 운영지침), 국가공무원 복무규정 제7조",
      tips: "e-사람에서 평소 시차출퇴근을 쓰시더라도 당직일 하루는 '기본근무(09~18시)'로 일시 변경 신청해 두셔야 결재 반려를 막을 수 있습니다.",
      recommendedQuestions: ["당직 끝나고 다음 날 쉴 수 있나요?", "휴일 일직 근무 시 수당은 얼마인가요?", "유연근무제 종류는 어떤 게 있나요?"],
    };
  }

  // Rule 2: 당직 후 대체휴무 / 다음날 휴무
  if (has(clean, "당직", "숙직") && has(clean, "대체", "휴무", "쉬", "다음날", "익일", "휴가")) {
    return {
      verdict: "✅ 가능 (숙직 익일 대체휴무 부여)",
      text:
        "평일 야간 숙직근무자는 근무종료시간이 속하는 날(익일 오전 09:00 이후) 근무시간의 전부 또는 일부를 휴무(대체휴무)할 수 있습니다.\n\n" +
        "■ 불가피하게 당일 쉬지 못할 경우: 업무 사정상 익일 즉시 휴무가 곤란한 경우, 소속기관장 승인을 받아 당직일로부터 6주 이내에 대체휴무를 사용할 수 있습니다.",
      legalBasis: "국가공무원 복무규정 제7조 제3항, 국가공무원 복무·징계 예규",
      tips: "숙직 후 다음 날 긴급업무로 출근했다면 6주 이내 날짜를 지정하여 e-사람 '당직 대체휴무'를 올리세요.",
      recommendedQuestions: ["당직 당일 유연근무 가능한가요?", "휴일 일직도 대체휴무가 나오나요?", "초과근무 상한 시간은 얼마인가요?"],
    };
  }

  // Rule 3: 연가 일수 / 1년 미만 연가 / 신규 연가
  if (clean.includes("연가") && has(clean, "며칠", "몇개", "일수", "신규", "1년", "발생", "계산", "첫해")) {
    return {
      verdict: "📌 재직 1년 미만 기본 11일 (군 복무기간 합산 가능)",
      text:
        "신규 공무원의 연가 일수는 재직기간에 따라 산정됩니다. (2026.6.23 시행 최신 예규 기준)\n\n" +
        "■ 1개월 이상 ~ 1년 미만: 11일\n" +
        "■ 1년 이상 ~ 3년 미만: 15일\n" +
        "■ 3년 이상 ~ 4년 미만: 16일\n" +
        "■ 4년 이상 ~ 5년 미만: 17일\n" +
        "■ 5년 이상 ~ 6년 미만: 20일\n" +
        "■ 6년 이상: 21일 (최대)\n\n" +
        "* 연도 중도 임용자는 해당 연도 근무월수에 비례하여 일할 계산됩니다.",
      legalBasis: "국가공무원 복무규정 제15조(연가일수)",
      tips: "군 복무기간(병역)이 있다면 공무원 재직기간에 100% 합산되므로 신규라도 15일 이상의 연가를 받을 수 있습니다!",
      recommendedQuestions: ["연가 당겨쓰기(가불)가 가능한가요?", "지각이나 조퇴하면 연가가 깎이나요?", "병가는 며칠까지 쓸 수 있나요?"],
    };
  }

  // Rule 4: 병가 & 진단서
  if (has(clean, "병가", "진단서") || (clean.includes("아파") && clean.includes("휴가"))) {
    return {
      verdict: "📋 연 60일 가능 (7일 이상 또는 누적 6일 초과 시 진단서 필수)",
      text:
        "일반병가는 연간 최대 60일까지 유급으로 사용 가능합니다.\n\n" +
        "■ 진단서 제출 기준:\n" +
        " 1) 연속으로 7일 이상 병가를 사용하는 경우\n" +
        " 2) 당해 연도 누적 병가일수가 6일을 초과할 때(7일째부터)\n" +
        "■ 6일 이하의 단기 병가: 처방전, 진료확인서, 병원 영수증으로 소명 가능하며 진단서 생략 가능합니다.",
      legalBasis: "국가공무원 복무규정 제18조(병가), 복무·징계 예규",
      tips: "진단서 첨부 대상인데 미제출 시 병가가 승인되지 않고 '연가'에서 차감되므로 주의하세요.",
      recommendedQuestions: ["공가와 병가의 차이는 무엇인가요?", "연가 며칠까지 나오나요?", "모성보호시간은 어떻게 쓰나요?"],
    };
  }

  // Rule 5: 겸직 / 유튜브 / 블로그 / 투잡 / 외부강의
  if (has(clean, "겸직", "유튜브", "블로그", "수익", "투잡", "외부강의", "강의", "부업")) {
    return {
      verdict: "⚠️ 수익 창출 시 반드시 사전 '겸직허가' 필수!",
      text:
        "취미성 비영리 활동은 자유롭지만, 수익이 발생하면 반드시 소속기관장의 사전 겸직허가를 받아야 합니다.\n\n" +
        "■ 유튜브: 구독자 1천명 & 시청 4천시간 등 수익창출 승인 시점부터 겸직허가 필수\n" +
        "■ 외부강의: 사례금을 받는 경우 사전(또는 10일 이내) e-사람에 신고 (5급 이하 1시간 20만원 한도)\n" +
        "■ 절대 금지: 직무 비밀 누설, 특정 정당/정치 지지·비판, 특정 상품 유료 PPL 광고.",
      legalBasis: "국가공무원법 제64조, 공무원의 인터넷 개인방송 활동 표준지침",
      tips: "수익이 통장에 1원이라도 입금되기 전에 복무·감사 부서에 겸직허가 신청서를 내셔야 징계를 예방할 수 있습니다.",
      recommendedQuestions: ["외부강의 신고 기준과 사례금 상한은?", "공무원 징계 종류는 어떤 게 있나요?", "지각 조퇴 누적 시 어떻게 되나요?"],
    };
  }

  // Rule 6: 초과근무 / 야근 / 시간외
  if (has(clean, "초과", "시간외", "야근", "정액")) {
    return {
      verdict: "💰 1일 최대 4시간, 월 최대 57시간 인정 (정액분 10시간 기본)",
      text:
        "초과근무(시간외근무)는 규정상 상한이 정해져 있습니다.\n\n" +
        "■ 평일 인정 기준: 정규 퇴근 후 1시간 기본 공제(식사시간) 후 실근무 시간 인정\n" +
        "■ 상한선: 1일 최대 4시간, 월 최대 57시간\n" +
        "■ 정액분(10시간): 해당 월 출근일수가 15일 이상이면 실적과 무관하게 10시간분 정액 수당 기본 지급!",
      legalBasis: "공무원수당 등에 관한 규정 제15조, 공무원보수 등의 업무지침",
      tips: "평일 퇴근 후 19시까지만 일하면 1시간이 기본 공제되어 인정시간이 0시간이 되니 2시간 이상 근무 시 효율적입니다.",
      recommendedQuestions: ["출장 중 초과근무 인정되나요?", "당직근무 당일 유연근무 가능한가요?", "지각 조퇴 연가 공제 기준은?"],
    };
  }

  // Rule 6-1: 유산·사산휴가 / 난임치료휴가 / 출산휴가 세부(연장·미숙아 등)
  if (has(clean, "유산", "사산", "난임") || (clean.includes("출산") && has(clean, "며칠", "일수", "연장", "미숙아"))) {
    return {
      verdict: "🤰 유산·사산휴가는 임신 주수별 10~90일, 난임치료휴가는 시술 종류별 1~4일",
      text:
        "■ 출산휴가(본인): 90일(다태아 120일), 출산 후 45일(다태아 60일) 이상 확보 필수. 미숙아(37주미만 또는 2,500g미만)로 신생아중환자실 입원 시 100일로 연장.\n\n" +
        "■ 유산·사산휴가(임신 주수별, 토·공휴일 포함 계산):\n" +
        " - 15주 이내: 10일 / 16~21주: 30일 / 22~27주: 60일 / 28주 이상: 90일\n" +
        " - 배우자(남성)도 3일의 유산·사산휴가 사용 가능\n\n" +
        "■ 난임치료시술휴가: 인공수정 총 2일, 체외수정(동결배아이식) 총 3일, 체외수정(난자채취) 총 4일, 남성(정자채취일) 1일\n\n" +
        "* 배우자 출산휴가(20일, 다태아 25일)는 별도 항목이니 '배우자 출산휴가'로 다시 물어보세요.",
      legalBasis: "국가공무원 복무규정 제20조",
      tips: "유산·사산휴가는 일반 연가와 달리 토·공휴일도 일수에 포함해 계산되니 주의하세요.",
      recommendedQuestions: ["모성보호시간과 육아시간은 어떻게 쓰나요?", "가족돌봄휴가는 어떤 경우에 쓰나요?", "여성보건휴가(생리휴가)는 며칠인가요?"],
    };
  }

  // Rule 7: 결혼 / 출산 / 사망 / 경조사 / 조부모 / 외조부모 / 형제자매 / 입양
  if (has(clean, "결혼", "경조사", "출산", "사망", "장례", "상조", "조부모", "외조부모", "할머니", "할아버지", "형제", "자매", "입양")) {
    return {
      verdict: "🎉 본인결혼 5일, 배우자출산 20일, 부모·배우자부모 5일, 조부모·외조부모 3일, 형제자매 3일",
      text:
        "경조사 특별휴가는 국가공무원 복무규정 [별표2]에 따라 법정 일수가 전액 유급으로 부여됩니다.\n\n" +
        "■ 결혼:\n" +
        "  - 본인 결혼: 5일 (혼인일 또는 결혼식일로부터 30일 이내 신청)\n" +
        "  - 자녀 결혼: 1일\n\n" +
        "■ 출산:\n" +
        "  - 배우자 출산: 20일 (다태아 25일). 출산예정일 30일 전부터 출산 후 120일(다태아 150일) 이내 3회(다태아 5회) 분할 사용 가능\n\n" +
        "■ 사망 (장례):\n" +
        "  - 배우자, 본인의 부모, 배우자의 부모: 5일\n" +
        "  - 본인 및 배우자의 조부모(친조부모), 외조부모: 3일\n" +
        "  - 자녀와 그 자녀의 배우자(사위·며느리): 3일\n" +
        "  - 본인 및 배우자의 형제자매: 3일\n\n" +
        "■ 입양: 본인 20일\n\n" +
        "★ 휴가일수 계산 규칙: 주말(토요일) 및 법정 공휴일은 휴가일수에 산입하지 않습니다(평일만 카운트). 사유 발생일을 포함하여 전후에 연속 사용이 원칙입니다.",
      legalBasis: "국가공무원 복무규정 제20조 제1항 [별표2] 경조사별 휴가일수표",
      tips: "사망 경조사 휴가는 사망일 또는 장례일 당일부터 기산할 수 있으며, 주말이 낀 경우 실제 쉬는 평일 일수만 차감되므로 더욱 넉넉히 장례 및 상속 절차를 치를 수 있습니다.",
      recommendedQuestions: ["유연근무 중 출장 갈 수 있나요?", "모성보호시간과 육아시간은 어떻게 쓰나요?", "공가 사유에는 어떤 것들이 있나요?"],
    };
  }

  // Rule 7-1: 유연근무와 출장 병행 여부
  if (has(clean, "유연", "시차") && has(clean, "출장", "관내", "관외")) {
    return {
      verdict: "⚠️ 반일 관내출장은 가능 / 종일 관외출장 및 재택출장은 유연근무 해제·취소 후 신청",
      text:
        "유연근무 유형과 출장 성격에 따라 기준이 다릅니다.\n\n" +
        "1. 시차출퇴근형(1일 8시간 유지) + 관내출장:\n" +
        "  - 가능합니다. 본인의 시차근무 시간대(예: 08:00~17:00) 내에서 몇 시간 관내출장을 다녀온 뒤 시간 맞춰 퇴근하면 됩니다.\n\n" +
        "2. 시차출퇴근형 + 종일 관외출장:\n" +
        "  - 관외출장은 통상 기본근무(09:00~18:00) 기준으로 일비·식비가 지급되므로, e-사람에서 당일 시차출퇴근을 '기본근무'로 변경/취소한 후 출장 기안을 올려야 합니다.\n\n" +
        "3. 재택근무 / 스마트워크 중 출장:\n" +
        "  - 원칙적 불가. 재택근무일에는 자택 근무가 전제이므로, 현장 출장이 필요하면 재택근무를 취소(정상근무로 환원)하고 출장 신청을 해야 합니다.",
      legalBasis: "국가공무원 복무·징계 예규 제2장(유연근무제 운영지침), 공무원 여비 규정",
      tips: "종일 출장이나 재택근무일 출장은 e-사람에서 유연근무를 '취소'한 뒤 출장신청서를 상신하는 것이 복무 감사에서 가장 안전합니다.",
      recommendedQuestions: ["관내출장과 관외출장 여비 차이는?", "당직 당일 유연근무 가능한가요?", "지각 조퇴 누적 시 연가 공제는?"],
    };
  }

  // Rule 7-2: 연가 당겨쓰기(가불) 및 연가저축 / 권장연가
  if (has(clean, "당겨", "가불", "저축", "이월", "보상비")) {
    return {
      verdict: "✅ 연가 당겨쓰기(최대 잔여일수 범위) 및 연가저축(소멸시효 폐지) 가능",
      text:
        "공무원 연가는 사정에 따라 당겨쓰거나 다음 해로 저축할 수 있습니다.\n\n" +
        "■ 연가 당겨쓰기(가불): 재직기간(1년미만5일/1~2년6일/2~3년7일/3~4년8일/4년이상10일) 범위 내에서 다음 재직기간의 연가일수를 미리 당겨서 사용할 수 있습니다.\n\n" +
        "■ 연가저축제도: 2024.7.2. 개정으로 저축연가 소멸시효가 폐지되어 기한 제한 없이 계속 적립하고, 10일 이상 장기휴가로 활용할 수 있습니다.\n\n" +
        "■ 연가보상비: 사용하지 못한 잔여 연가에 대해 예산 범위 내(최대 20일 한도)에서 수당으로 지급받습니다.",
      legalBasis: "국가공무원 복무규정 제16조 제5항, 제16조의2, 제16조의3",
      tips: "신규 공무원이 부득이하게 첫해 연가가 부족할 때 복무담당자에게 '연가 가불(당겨쓰기)' 신청을 문의하시면 e-사람에서 승인받을 수 있습니다.",
      recommendedQuestions: ["신규 연가 일수 산정 기준은?", "병가 며칠부터 진단서 내야 하나요?", "지각 조퇴 연가 공제 기준은?"],
    };
  }

  // Rule 8: 모성보호시간 / 육아시간 / 임신
  if (has(clean, "모성", "육아", "임신", "임산부", "임신검진")) {
    return {
      verdict: "👶 모성보호 1일 2시간, 육아시간 1일 2시간 (만 8세/초2 이하)",
      text:
        "임신 및 영유아 양육을 위한 특별 복무 지원 제도입니다.\n\n" +
        "■ 모성보호시간: 임신 중인 여성공무원 전 기간 1일 2시간 (늦게 출근 or 일찍 퇴근), 임신 12주 이내·32주 이후는 신청 시 승인 의무, 13~31주는 업무상황을 감안해 승인\n" +
        "■ 육아시간: 만 8세 이하 또는 초등 2학년 이하 자녀를 둔 공무원 1일 2시간 (자녀 1인당 최대 36개월, 자녀 2명 이상이면 각각 사용 가능하나 같은 날 중복사용은 불가)\n" +
        "■ 임신검진휴가: 임신 기간 중 총 10일(반일/하루 단위) 유급 부여. 배우자(남성)도 임신검진 동행을 위해 10일 범위에서 사용 가능\n" +
        "■ 모성보호시간·육아시간을 쓰는 날은 최소 4시간 이상 정상 근무해야 하며, 둘은 같은 날 중복 사용할 수 없습니다.",
      legalBasis: "국가공무원 복무규정 제20조 제4항 및 제5항",
      tips: "모성보호시간이나 육아시간을 사용하는 날에도 최소 4시간 이상은 정상 근무해야 하며, 시간외근무는 원칙적으로 인정되지 않습니다.",
      recommendedQuestions: ["배우자 출산휴가는 며칠인가요?", "유산·사산휴가는 며칠인가요?", "가족돌봄휴가는 어떤 경우에 쓰나요?"],
    };
  }

  // Rule 8-1: 가족돌봄휴가
  if (
    has(clean, "가족돌봄", "돌봄휴가") ||
    (clean.includes("부모") && has(clean, "간병", "돌봄", "병원")) ||
    clean.includes("자녀병원") ||
    (clean.includes("자녀") && clean.includes("병원"))
  ) {
    return {
      verdict: "👨‍👩‍👧 자녀돌봄·병원동행·가족간병 등 5가지 사유로 연 최대 10일(유급+무급)",
      text:
        "가족돌봄휴가는 다음 5가지 사유로 사용할 수 있습니다.\n\n" +
        "1) 어린이집·유치원·학교 휴업·휴원·휴교\n" +
        "2) 자녀 학교 공식행사·상담 참여(입학식·졸업식 등)\n" +
        "3) 취학 전 자녀 돌봄\n" +
        "4) 미성년·장애인 자녀 병원 진료 동행\n" +
        "5) 조부모·부모·배우자·자녀의 질병·사고·노령 돌봄\n\n" +
        "■ 유급일수: 자녀 수 + 1일(장애인 자녀 또는 한부모가족이면 +1일 가산), 유급분은 시간 단위 분할 가능\n" +
        "■ 유급 소진 후 연간 최대 10일(유·무급 합산)까지 무급으로 사용 가능(무급은 일 단위만)",
      legalBasis: "국가공무원 복무규정 제20조",
      tips: "자녀가 2명이면 유급 3일이 기본 확보되니, 자녀수에 맞춰 유급 일수부터 확인하세요.",
      recommendedQuestions: ["모성보호시간과 육아시간은 어떻게 쓰나요?", "장기재직휴가·포상휴가는 어떤 게 있나요?", "공가 사유에는 어떤 것들이 있나요?"],
    };
  }

  // Rule 9: 지각 / 조퇴 / 외출 / 반차
  if (has(clean, "지각", "조퇴", "외출", "반차", "시간제")) {
    return {
      verdict: "⏱️ 지각·조퇴·외출 누적 8시간마다 연가 1일 공제",
      text:
        "근무시간 중의 지각, 조퇴, 외출은 분 단위로 연간 누적 합산됩니다.\n\n" +
        "■ 계산법: 해당 연도 내 지각+조퇴+외출 시간의 합계가 8시간이 될 때마다 연가 1일을 사용한 것으로 공제합니다.\n" +
        "■ 8시간 미만의 잔여 시간은 연가 공제되지 않고 절사됩니다.",
      legalBasis: "국가공무원 복무규정 제17조",
      tips: "병원이나 은행 등 간단한 볼일은 4시간 반차를 쓰는 것보다 1~2시간 외출/조퇴를 신청하는 것이 연가를 아끼는 방법입니다.",
      recommendedQuestions: ["신규 연가 며칠 나오나요?", "재택근무 중 외출이 가능한가요?", "당직근무 당일 유연근무 가능한가요?"],
    };
  }

  // Rule 10: 출장 / 출장비 / 여비 / 식비
  if (has(clean, "출장", "여비", "식비", "일비", "관내", "관외")) {
    return {
      verdict: "✈️ 관내 1~2만원 정액 / 관외 실비(교통·숙박)+정액(일비·식비)",
      text:
        "출장 여비는 관내출장과 관외출장으로 엄격히 구분됩니다.\n\n" +
        "■ 관내출장(같은 시·군 또는 12km 미만):\n" +
        " - 4시간 이상: 20,000원 (공용차량 이용 시 1만원 감액)\n" +
        " - 4시간 미만: 10,000원\n" +
        "■ 관외출장: 운임(KTX 등 실비) + 일비(1일 2.5만원) + 식비(1일 2.5만원) + 숙박비 실비(서울 10만원 상한)\n" +
        "* 주최 측에서 식사를 무료 제공한 경우 식비를 감액 정산해야 합니다.",
      legalBasis: "공무원 여비 규정 제16조, 제18조",
      tips: "관외출장 결제 승차권 영수증과 카드 매출전표는 PDF로 보관 후 e-사람 여비정산 시 꼭 첨부하세요.",
      recommendedQuestions: ["출장 중 초과근무 수당 받을 수 있나요?", "유연근무 종류는 어떤 게 있나요?", "당직 대체휴무 사용 기한은?"],
    };
  }

  // Rule 11: 공가 / 건강검진 / 투표 / 예비군 / 헌혈
  if (has(clean, "공가", "건강검진", "검진", "투표", "예비군", "민방위", "헌혈")) {
    return {
      verdict: "🏛️ 연가 차감 없는 전액 유급 '공가' 인정 사유입니다.",
      text:
        "다음 사유에 해당하는 경우 연가를 쓰지 않고 공가(유급)로 처리할 수 있습니다.\n\n" +
        "■ 국민건강보험 공단 건강검진 (1일)\n" +
        "■ 예비군 훈련 및 민방위 교육 소집\n" +
        "■ 대통령·국회의원·지방선거 투표권 행사\n" +
        "■ 헌혈 (직접 소요 시간)\n" +
        "■ 직무 관련 법원 증인·참고인 출석",
      legalBasis: "국가공무원 복무규정 제19조(공가)",
      tips: "건강검진 완료 후 병원에서 '검진확인서'를 발급받아 e-사람 공가 결재문서에 첨부하면 승인됩니다.",
      recommendedQuestions: ["병가와 공가의 차이는?", "신규 공무원 연가 일수는?", "결혼 특별휴가는 며칠?"],
    };
  }

  // Rule 12: 음주운전 징계기준
  if (has(clean, "음주운전", "음주측정") || (clean.includes("술") && clean.includes("운전"))) {
    return {
      verdict: "🚨 최초 적발이라도 혈중알코올농도 0.08% 이상이면 강등~정직(중징계)",
      text:
        "음주운전은 징계감경 제외대상 비위로, 표창 등 공적이 있어도 감경되지 않습니다.\n\n" +
        "■ 최초 음주운전(자동차등): 0.08% 미만 정직~감봉 / 0.08~0.2% 미만 강등~정직 / 0.2% 이상 해임~정직 / 음주측정 불응 해임~정직\n" +
        "■ 자전거등 음주운전(최초): 감봉~견책\n" +
        "■ 2회 음주운전: 파면~강등 / 3회 이상: 파면~해임\n" +
        "■ 면허정지·취소 상태에서 재운전: 강등~정직(그 상태에서 또 적발되면 파면~강등)\n" +
        "■ 인적·물적피해 교통사고: 상해·물피 해임~정직, 사망사고 파면~해임\n" +
        "■ 운전업무 관련 공무원이 면허취소 처분을 받으면 반드시 파면 또는 해임",
      legalBasis: "공무원 징계령 시행규칙 [별표 1의5], 국가공무원 복무·징계 예규 제12장 Ⅵ",
      tips: "0.08% 미만이라도 최초부터 정직~감봉이 가능한 중대 비위이므로 '초범이라 괜찮겠지'라는 생각은 절대 금물입니다.",
      recommendedQuestions: ["징계의 종류와 시효는 어떻게 되나요?", "금품을 받으면 어떤 징계를 받나요?", "징계 기록은 언제 말소되나요?"],
    };
  }

  // Rule 13: 징계 종류 / 징계시효 / 징계말소
  if (clean.includes("징계") && has(clean, "종류", "시효", "말소", "파면", "해임", "강등", "정직", "감봉", "견책")) {
    return {
      verdict: "⚖️ 파면>해임>강등>정직(중징계) / 감봉>견책(경징계), 시효는 원칙 3년(금품·성비위 등 5년)",
      text:
        "■ 징계 6종류(무거운 순): 파면 - 해임 - 강등 - 정직 - 감봉 - 견책\n" +
        "  (파면·해임·강등·정직 = 중징계 / 감봉·견책 = 경징계)\n\n" +
        "■ 징계시효: 원칙 3년. 금품·향응수수, 공금횡령·유용, 성폭력·성희롱·성매매 등은 5년\n" +
        "■ 징계말소기간(집행종료일 기준): 강등 9년 / 정직 7년 / 감봉 5년 / 견책 3년 / 직위해제 2년 / 불문경고 1년\n" +
        "■ 감경 제외대상: 금품수수, 음주운전, 성비위, 소극행정 등은 공적이 있어도 징계를 감경받을 수 없습니다.",
      legalBasis: "국가공무원법 제79조·제83조의2, 공무원 인사기록·통계 및 인사사무 처리 규정",
      tips: "징계처분을 받았어도 말소제한기간(견책 3년~강등 9년)이 지나면 인사기록에서 삭제됩니다.",
      recommendedQuestions: ["음주운전 징계기준은 어떻게 되나요?", "금품을 받으면 어떤 징계를 받나요?", "경고나 주의는 징계인가요?"],
    };
  }

  // Generic search fallback: 규정 데이터베이스 검색
  const keywords = query.split(" ").filter((k) => k.length >= 2);
  const matches = state.regulations.filter((reg) =>
    keywords.some(
      (kw) => reg.title.includes(kw) || reg.shortSummary.includes(kw) || reg.tags.some((t) => t.includes(kw))
    )
  );

  if (matches.length > 0) {
    const best = matches[0];
    return {
      verdict: "📌 관련 복무규정 검색 결과",
      text: `[${best.title}]\n\n${best.shortSummary}\n\n${best.detailedContent.slice(0, 300)}...`,
      legalBasis: best.legalBasis,
      tips: best.tips,
      recommendedQuestions: ["당직 당일 유연근무 가능한가요?", "신규 연가 일수 산정 기준은?", "병가 진단서 제출 기준은?"],
    };
  }

  // Default friendly response
  return {
    verdict: "💡 복무규정 질의 안내",
    text:
      "질문하신 내용에 대한 키워드 규정을 찾지 못했습니다.\n\n" +
      "아래와 같은 핵심 키워드로 질문해보세요:\n" +
      "• '당직인데 유연근무 가능한가요?'\n" +
      "• '신입 연가 며칠 나오나요?'\n" +
      "• '병가 쓸 때 진단서 꼭 내야 해?'\n" +
      "• '유튜브 수익창출 겸직허가 받아야 해?'\n" +
      "• '초과근무 하루 몇 시간까지 인정돼?'\n" +
      "• '음주운전 징계기준은 어떻게 되나요?'",
    legalBasis: "국가공무원 복무규정 및 복무·징계 예규",
    tips: "상단 '규정검색' 탭에서 카테고리별로 전체 규정 목록을 바로 조회할 수도 있습니다.",
    recommendedQuestions: ["당직 당일 유연근무 가능한가요?", "신규 연가 며칠 나오나요?", "유튜브 겸직허가 기준은?", "음주운전 징계기준은?"],
  };
}

// ===========================================================================
// 화면 전환(History API) — 계약왕과 동일한 방식
// ===========================================================================

// 화면별 "뒤로가기 깊이" — 0은 홈(규정검색), 1은 나머지 탭/상세.
const SCREEN_DEPTH = { search: 0, chat: 1, notebook: 1, detail: 1 };

function computeDir(fromScreen, toScreen) {
  const fromIdx = TABS.findIndex((t) => t.key === fromScreen);
  const toIdx = TABS.findIndex((t) => t.key === toScreen);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return null;
  return toIdx > fromIdx ? "enter-from-right" : "enter-from-left";
}

function applyScreen(screen, dir) {
  state.screen = screen;
  if (window.bokmuTrack) window.bokmuTrack("screen", { tab: screen });
  render();
  if (dir) {
    const el = document.querySelector(".screen");
    if (el) {
      el.classList.add(dir);
      el.addEventListener("animationend", () => el.classList.remove(dir), { once: true });
    }
  }
}

let pendingPopTarget = null;

function go(screen) {
  const dir = computeDir(state.screen, screen);
  const curDepth = SCREEN_DEPTH[state.screen] ?? 0;
  const nextDepth = SCREEN_DEPTH[screen] ?? 0;

  if (nextDepth > curDepth) {
    for (let i = 0; i < nextDepth - curDepth; i++) history.pushState({ screen }, "");
    applyScreen(screen, dir);
  } else if (nextDepth < curDepth) {
    pendingPopTarget = { screen, dir };
    history.go(nextDepth - curDepth);
  } else {
    applyScreen(screen, dir);
  }
}

window.addEventListener("popstate", () => {
  if (pendingPopTarget) {
    const { screen, dir } = pendingPopTarget;
    pendingPopTarget = null;
    applyScreen(screen, dir);
    return;
  }
  const depth = SCREEN_DEPTH[state.screen] ?? 0;
  if (depth === 0) return;
  applyScreen("search", computeDir(state.screen, "search"));
});

// 탭 화면에서 좌우로 스와이프하면 옆 탭으로 넘어갑니다.
function bindSwipeNav() {
  const el = document.querySelector(".screen");
  if (!el) return;
  const idx = TABS.findIndex((t) => t.key === state.screen);
  if (idx === -1) return;

  const MIN_DIST = 56;
  const MAX_TIME = 700;
  let startX = 0, startY = 0, startT = 0, tracking = false;

  el.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startT = Date.now();
    tracking = true;
  }, { passive: true });

  el.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Date.now() - startT > MAX_TIME) return;
    if (Math.abs(dx) < MIN_DIST || Math.abs(dx) < Math.abs(dy) * 1.4) return;

    if (dx < 0 && idx < TABS.length - 1) go(TABS[idx + 1].key);
    else if (dx > 0 && idx > 0) go(TABS[idx - 1].key);
  }, { passive: true });
}

// ===========================================================================
// 화면 렌더
// ===========================================================================

function renderIntro() {
  return `
    <div class="intro-screen" id="intro-screen">
      <div class="intro-mark">복무<br />왕</div>
      <div class="intro-rule"></div>
      <div class="intro-sub">복무규정 헷갈리는 그 순간,<br />바로 확인합니다</div>
      <div class="intro-en">DUTY KING</div>
    </div>
  `;
}

function regCardHtml(reg) {
  const cat = categoryOf(reg.category);
  return `
    <button class="reg-card" data-reg-id="${esc(reg.id)}">
      <span class="top">
        <span class="reg-cat">${cat ? esc(cat.emoji) : ""} ${cat ? esc(cat.label) : ""}</span>
        ${reg.isImportant ? '<span class="reg-important">중요</span>' : ""}
      </span>
      <span class="reg-title">${esc(reg.title)}</span>
      <span class="reg-summary">${esc(reg.shortSummary)}</span>
    </button>
  `;
}

// 규정 목록 + 시나리오 목록 블록 (LIST_LIMIT 넘으면 "더보기"로 나머지 펼침)
function listBlock(label, gap, items, cardFn, listClass, listId) {
  if (!items.length) return "";
  const clip = items.length > LIST_LIMIT;
  const more = clip
    ? `<button class="btn-more" data-expand="${listId}">더보기 (${items.length - LIST_LIMIT}건 더)</button>`
    : "";
  return `
    <div class="sub-head${gap ? " sub-head--gap" : ""}"><span class="label">${label}</span><span class="rule"></span></div>
    <div class="${listClass}${clip ? " clip" : ""}" id="${listId}">${items.map(cardFn).join("")}</div>
    ${more}
  `;
}

// 한 줄 답 결과 영역 — 검색어(키워드)가 있으면 관련 규정 + 관련 시나리오, 없으면 대표 규정 + 시나리오
function searchResultsHtml() {
  const q = (state.query || "").trim();

  if (q) {
    const regs = matchRegulations(state.query, "ALL");
    const scs = matchScenarios(state.query);
    if (!regs.length && !scs.length) {
      return `<div class="empty-state">"${esc(q)}"에 걸리는 내용이 없어요.<br />다른 핵심 낱말(예: 연가, 당직, 겸직)로 찾아보거나, 챗봇·노트북 탭을 이용해 보세요.</div>`;
    }
    return (
      listBlock(`관련 규정 ${regs.length}건`, false, regs, regCardHtml, "reg-list", "reg-hits") +
      listBlock(`관련 상황 ${scs.length}건`, regs.length > 0, scs, scenarioCardHtml, "scenario-list", "sc-hits")
    );
  }

  // 검색어 없음 — 대표 규정 5개 + 시나리오
  const reps = REPRESENTATIVE_IDS
    .map((id) => state.regulations.find((r) => r.id === id))
    .filter(Boolean);

  return (
    listBlock("이건 자주 찾아요", false, reps, regCardHtml, "reg-list", "reg-hits") +
    listBlock("이런 상황, 되나요?", reps.length > 0, state.scenarios, scenarioCardHtml, "scenario-list", "sc-hits")
  );
}

function renderSearch() {
  const q = (state.query || "").trim();
  const count = q
    ? (matchRegulations(state.query, "ALL").length + matchScenarios(state.query).length) + "건"
    : state.regulations.length + "건";

  return `
    <div class="screen">
      <div class="app-head">
        <span class="mark">복무왕</span>
        <span class="badge">국가공무원 복무 길라잡이</span>
      </div>

      <h1 class="home-title">뭐가 <span class="hi">궁금</span>한가요?</h1>

      <div class="search-box">
        <input id="reg-search" type="text" placeholder="예: 연가" value="${esc(state.query)}" />
        <span class="count" id="hit-count">${count}</span>
      </div>
      <p class="search-hint">자주 쓰는 낱말을 누르거나, 핵심 낱말 하나로 직접 검색해 보세요. (예: "신규 연가 며칠 나오나요?" ✗ → "연가" ✓)</p>

      <div class="chip-row" id="keyword-chips">
        ${CHIPS.map((c) => `<button class="chip ${c === q ? "on" : ""}" data-chip="${esc(c)}">${esc(c)}</button>`).join("")}
      </div>

      <div id="reg-results">${searchResultsHtml()}</div>
    </div>
  `;
}

function renderDetail() {
  const reg = state.current;
  if (!reg) return renderSearch();
  const cat = categoryOf(reg.category);

  return `
    <div class="screen detail-screen">
      <div class="detail-head">
        <button id="back-btn" class="back-btn" aria-label="뒤로">←</button>
        <span class="reg-cat">${cat ? esc(cat.emoji) : ""} ${cat ? esc(cat.label) : ""}</span>
      </div>

      <h1 class="detail-title">${esc(reg.title)}</h1>
      <p class="detail-summary">${esc(reg.shortSummary)}</p>

      <div class="detail-block">
        <p class="detail-label">근거 법령</p>
        <p class="detail-basis">${esc(reg.legalBasis)}</p>
      </div>

      <div class="detail-block">
        <p class="detail-label">상세 내용</p>
        <p class="detail-body">${nl2br(reg.detailedContent)}</p>
      </div>

      <div class="detail-block tip-block">
        <p class="detail-label">💡 실무 팁</p>
        <p class="detail-body">${esc(reg.tips)}</p>
      </div>

      ${
        reg.commonMistakes
          ? `<div class="detail-block mistake-block">
              <p class="detail-label">⚠️ 자주 하는 실수</p>
              <p class="detail-body">${esc(reg.commonMistakes)}</p>
            </div>`
          : ""
      }

      <div class="tag-row">
        ${reg.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}
      </div>
    </div>
  `;
}

function chatBubbleHtml(msg) {
  if (msg.role === "user") {
    return `<div class="chat-row user"><div class="chat-bubble user">${esc(msg.text)}</div></div>`;
  }
  const r = msg.response;
  return `
    <div class="chat-row bot">
      <div class="chat-bubble bot">
        ${r.verdict ? `<p class="chat-verdict">${esc(r.verdict)}</p>` : ""}
        <p class="chat-text">${nl2br(r.text)}</p>
        ${r.legalBasis ? `<p class="chat-basis">📖 ${esc(r.legalBasis)}</p>` : ""}
        ${r.tips ? `<p class="chat-tips">💡 ${esc(r.tips)}</p>` : ""}
        ${
          r.recommendedQuestions && r.recommendedQuestions.length
            ? `<div class="chat-suggestions">
                ${r.recommendedQuestions.map((q) => `<button class="suggestion-chip" data-suggest="${esc(q)}">${esc(q)}</button>`).join("")}
              </div>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderChat() {
  return `
    <div class="screen chat-screen">
      <div class="app-head">
        <span class="mark">복무왕 챗봇</span>
        <span class="badge">오프라인 즉답</span>
      </div>

      <div class="chat-log" id="chat-log">
        ${
          state.chatMessages.length
            ? state.chatMessages.map(chatBubbleHtml).join("")
            : `<div class="chat-intro-card">
                <p>궁금한 복무·징계 규정을 실제 말투로 물어보세요.</p>
                <p class="chat-examples">예) "당직인데 유연근무 가능한가요?" · "음주운전 징계기준은?" · "신규 연가 며칠 나오나요?"</p>
              </div>`
        }
      </div>

      <form class="chat-input-row" id="chat-form">
        <input id="chat-input" type="text" placeholder="질문을 입력하세요" value="${esc(state.chatDraft)}" autocomplete="off" />
        <button type="submit" class="chat-send">전송</button>
      </form>
    </div>
  `;
}

function scenarioCardHtml(sc) {
  return `
    <div class="scenario-card">
      <p class="scenario-situation">${esc(sc.situation)}</p>
      <button class="scenario-toggle" data-sc-id="${esc(sc.id)}">판정 보기</button>
      <div class="scenario-verdict" id="verdict-${esc(sc.id)}" hidden>
        <p class="scenario-badge ${sc.isAllowed ? "allowed" : "denied"}">${sc.isAllowed ? "✅" : "❌"} ${esc(sc.verdictText)}</p>
        <p class="scenario-rule">${esc(sc.ruleSummary)}</p>
        <p class="scenario-exception">${esc(sc.exceptionNote)}</p>
        <p class="scenario-legal">📖 ${esc(sc.legalArticle)}</p>
      </div>
    </div>
  `;
}

function renderNotebook() {
  return `
    <div class="screen notebook-screen">
      <div class="nb-eyebrow">GOOGLE NOTEBOOK</div>
      <h2 class="nb-title">규정검색·챗봇으로 안 되면<br /><span class="hi">여기서 파고듭니다</span></h2>

      <div class="question-card">
        <div class="label">
          <span>물어볼 질문 · 수정 가능</span>
          <button class="copy-btn" id="copy-question" type="button">복사</button>
        </div>
        <textarea id="question-input" rows="3" aria-label="Notebook에 물어볼 질문" placeholder="궁금한 점을 적어보세요">${esc(state.notebookQuestion)}</textarea>
      </div>

      <div class="example-row">
        <span class="example-label">예시</span>
        ${EXAMPLE_QUESTIONS.map((q) => `<button class="example-chip" data-example="${esc(q)}">${esc(q)}</button>`).join("")}
      </div>

      <button class="btn-hi wide" id="notebook-cta">Notebook에서 열기 →</button>
      <p class="nb-note">질문은 자동 전달되지 않아요. 복사해서 붙여넣으세요. Google 계정 로그인이 필요해요.</p>

      <div class="sub-head"><span class="label">근거로 붙는 자료</span><span class="rule"></span></div>
      <div class="source-list">
        ${REFERENCE_SOURCES.map((s) => `
          <a class="source-row" href="book/${encodeURIComponent(s.file)}" download>
            <span class="info">
              <span class="title">${esc(s.title)}</span>
              <span class="meta">${esc(s.meta)}</span>
            </span>
            <span class="kind">${esc(s.kind || "PDF ↓")}</span>
          </a>
        `).join("")}
      </div>
      <p class="nb-note">참고자료는 판단을 돕기 위한 것이며, 법 개정 등 변경사항은 별도로 확인해 주세요.</p>

      <div class="nb-closing">
        <strong>더 확인이 필요하면</strong>
        <ul>
          <li>규정검색·챗봇에 없으면 → 위 예규 PDF·Notebook</li>
          <li>문의사항은 기관 복무담당자에게 한번 더 확인</li>
        </ul>
      </div>

      <p class="nb-credit">만든이 · 산림교육원 장우형</p>
    </div>
  `;
}

function renderTabBar() {
  const active = state.screen === "detail" ? "search" : state.screen;
  return `
    <nav class="tab-bar">
      ${TABS.map((t) => `<button class="tab-btn ${active === t.key ? "active" : ""}" data-tab="${t.key}">${t.label}</button>`).join("")}
    </nav>
  `;
}

function render() {
  const app = document.getElementById("app");

  if (state.screen === "intro") {
    app.innerHTML = renderIntro();
    bindEvents();
    return;
  }

  let body;
  if (state.screen === "search") body = renderSearch();
  else if (state.screen === "detail") body = renderDetail();
  else if (state.screen === "chat") body = renderChat();
  else body = renderNotebook();

  app.innerHTML = body + renderTabBar();
  bindEvents();

  if (state.screen === "chat") {
    const log = document.getElementById("chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  }
}

function openDetail(id) {
  const reg = state.regulations.find((r) => r.id === id);
  if (!reg) return;
  state.current = reg;
  if (window.bokmuTrack) window.bokmuTrack("reg_open", { id: reg.id, cat: reg.category });
  go("detail");
}

function openNotebook(seed) {
  const q = (state.query || "").trim();
  state.notebookQuestion =
    seed ||
    state.notebookQuestion ||
    (q ? `${q} 관련 국가공무원 복무·징계 예규 내용을 자세히 알려줘` : "");
  go("notebook");
}

// 시나리오 카드의 "판정 보기" 토글 — 규정검색 첫 화면에서 사용
function bindScenarioToggles(root) {
  (root || document).querySelectorAll(".scenario-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = document.getElementById("verdict-" + btn.dataset.scId);
      if (!panel) return;
      const willShow = panel.hidden;
      panel.hidden = !willShow;
      btn.textContent = willShow ? "판정 접기" : "판정 보기";
      if (willShow && window.bokmuTrack) window.bokmuTrack("verdict", { id: btn.dataset.scId });
    });
  });
}

function submitChat(text) {
  const q = (text || "").trim();
  if (!q) return;
  const response = answerQuery(q);
  state.chatMessages.push({ role: "user", text: q });
  state.chatMessages.push({ role: "bot", response });
  state.chatDraft = "";
  if (window.bokmuTrack) {
    // 규정을 못 찾은 질문만 (숫자를 지우고 30자로 잘라) 남깁니다.
    const missed = response.verdict === "💡 복무규정 질의 안내";
    const clean = window.bokmuSanitize ? window.bokmuSanitize(q) : "";
    if (missed && clean) window.bokmuTrack("chat_miss", { q: clean });
    else window.bokmuTrack("chat", { len: q.length });
  }
  render();
}

function bindEvents() {
  if (state.screen === "intro") {
    const introEl = document.getElementById("intro-screen");
    let advanced = false;
    const advance = () => {
      if (advanced) return;
      advanced = true;
      go("search");
    };
    introEl.addEventListener("click", advance);
    setTimeout(advance, 1400);
    return;
  }

  bindSwipeNav();

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === "notebook") openNotebook();
      else go(btn.dataset.tab);
    });
  });

  const backBtn = document.getElementById("back-btn");
  if (backBtn) backBtn.addEventListener("click", () => go("search"));

  if (state.screen === "search") {
    const input = document.getElementById("reg-search");
    const results = document.getElementById("reg-results");
    const count = document.getElementById("hit-count");

    const bindResults = () => {
      results.querySelectorAll(".reg-card").forEach((card) => {
        card.addEventListener("click", () => openDetail(card.dataset.regId));
      });
      bindScenarioToggles(results);
      results.querySelectorAll(".btn-more").forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = document.getElementById(btn.dataset.expand);
          if (target) target.classList.remove("clip");
          btn.remove();
          if (window.bokmuTrack) window.bokmuTrack("more", { id: btn.dataset.expand });
        });
      });
    };

    const update = () => {
      state.query = input.value;
      const q = state.query.trim();
      const regHits = q ? matchRegulations(state.query, "ALL").length : 0;
      const scHits = q ? matchScenarios(state.query).length : 0;
      results.innerHTML = searchResultsHtml();
      count.textContent = q ? (regHits + scHits) + "건" : state.regulations.length + "건";
      document.querySelectorAll(".chip[data-chip]").forEach((c) => c.classList.toggle("on", c.dataset.chip === q));
      bindResults();
      if (window.bokmuTrackSearch) window.bokmuTrackSearch(q, regHits, scHits);
    };

    input.addEventListener("input", update);
    document.querySelectorAll(".chip[data-chip]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const kw = chip.dataset.chip;
        // 같은 칩을 다시 누르면 검색 해제
        const turningOff = chip.classList.contains("on");
        input.value = turningOff ? "" : kw;
        // 키워드는 고정 목록(CHIPS)이라 그대로 남겨도 안전합니다.
        if (!turningOff && window.bokmuTrack) window.bokmuTrack("chip", { kw });
        update();
        results.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    });
    bindResults();
  }

  if (state.screen === "notebook") {
    const textarea = document.getElementById("question-input");
    if (textarea) {
      textarea.addEventListener("input", (e) => { state.notebookQuestion = e.target.value; });
    }
    document.querySelectorAll(".example-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.notebookQuestion = chip.dataset.example;
        if (textarea) textarea.value = state.notebookQuestion;
      });
    });
    const copyBtn = document.getElementById("copy-question");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        const text = (state.notebookQuestion || "").trim();
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = "복사됨";
          setTimeout(() => { copyBtn.textContent = "복사"; }, 1500);
        } catch (_) {
          if (textarea) { textarea.focus(); textarea.select(); }
        }
      });
    }
    const cta = document.getElementById("notebook-cta");
    if (cta) cta.addEventListener("click", () => {
      if (window.bokmuTrack) window.bokmuTrack("notebook_open", {});
      window.open(NOTEBOOK_URL, "_blank", "noopener");
    });

    document.querySelectorAll(".source-row").forEach((row) => {
      row.addEventListener("click", () => {
        if (window.bokmuTrack) window.bokmuTrack("pdf_download", {});
      });
    });
  }

  if (state.screen === "chat") {
    const form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitChat(input.value);
    });
    input.addEventListener("input", () => {
      state.chatDraft = input.value;
    });
    document.querySelectorAll(".suggestion-chip").forEach((chip) => {
      chip.addEventListener("click", () => submitChat(chip.dataset.suggest));
    });
  }
}

// ===========================================================================
// 시작
// ===========================================================================

history.replaceState({ screen: "intro" }, "");
if (window.bokmuMarkSession) window.bokmuMarkSession();
render();
loadData();
