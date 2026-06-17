const datasets = {
  balanced: {
    primary: "期待",
    confidence: 82,
    summary: "影像與聲音結果一致偏正向，說話節奏穩定，表情變化自然，適合用於成果發表或學習回饋情境。",
    values: [
      ["喜悅", 34, "#2563eb"],
      ["期待", 28, "#14a36f"],
      ["驚訝", 16, "#f59e0b"],
      ["平靜", 14, "#0e9fbd"],
      ["壓力", 8, "#e24b68"],
    ],
  },
  visual: {
    primary: "平靜",
    confidence: 76,
    summary: "表情線索顯示情緒起伏較小，臉部狀態以平靜與專注為主，可搭配聲音線索避免單一判斷。",
    values: [
      ["平靜", 38, "#0e9fbd"],
      ["專注", 24, "#2563eb"],
      ["喜悅", 18, "#14a36f"],
      ["驚訝", 11, "#f59e0b"],
      ["壓力", 9, "#e24b68"],
    ],
  },
  audio: {
    primary: "專注",
    confidence: 79,
    summary: "聲音線索呈現穩定音量與清楚語調，模型推估使用者處於專注說明狀態，適合進一步生成逐段摘要。",
    values: [
      ["專注", 36, "#2563eb"],
      ["平靜", 26, "#0e9fbd"],
      ["喜悅", 17, "#14a36f"],
      ["緊張", 13, "#f59e0b"],
      ["疲憊", 8, "#e24b68"],
    ],
  },
};

const form = document.querySelector("#analysisForm");
const modeInput = document.querySelector("#modeInput");
const primaryEmotion = document.querySelector("#primaryEmotion");
const confidence = document.querySelector("#confidence");
const summary = document.querySelector("#summary");
const bars = document.querySelector("#bars");

function render(mode) {
  const data = datasets[mode] ?? datasets.balanced;
  primaryEmotion.textContent = data.primary;
  confidence.textContent = `${data.confidence}%`;
  summary.textContent = data.summary;
  bars.innerHTML = "";

  data.values.forEach(([label, value, color]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span>${label}</span>
      <span class="bar-track"><span class="bar-fill" style="--value: ${value}%; --bar-color: ${color}"></span></span>
      <span>${value}%</span>
    `;
    bars.appendChild(row);
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  render(modeInput.value);
});

modeInput.addEventListener("change", () => render(modeInput.value));
render("balanced");
