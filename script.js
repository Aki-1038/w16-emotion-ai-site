const form = document.querySelector("#analysisForm");
const mediaInput = document.querySelector("#mediaInput");
const modeInput = document.querySelector("#modeInput");
const mediaPreview = document.querySelector("#mediaPreview");
const canvas = document.querySelector("#analysisCanvas");
const statusText = document.querySelector("#statusText");
const primaryEmotion = document.querySelector("#primaryEmotion");
const confidence = document.querySelector("#confidence");
const summary = document.querySelector("#summary");
const bars = document.querySelector("#bars");

const colors = {
  "喜悅": "#2563eb",
  "期待": "#14a36f",
  "專注": "#0e9fbd",
  "平靜": "#64748b",
  "驚訝": "#f59e0b",
  "緊張": "#e24b68",
};

function setStatus(text) {
  statusText.textContent = text;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeScores(scores) {
  const entries = Object.entries(scores).map(([label, value]) => [label, Math.max(0, value)]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  return entries
    .map(([label, value]) => [label, Math.round((value / total) * 100)])
    .sort((a, b) => b[1] - a[1]);
}

function renderResults(result) {
  const values = normalizeScores(result.scores);
  const top = values[0] ?? ["無法判斷", 0];
  primaryEmotion.textContent = top[0];
  confidence.textContent = `${Math.max(46, Math.min(92, top[1] + 28))}%`;
  summary.textContent = result.summary;
  bars.innerHTML = "";

  values.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span>${label}</span>
      <span class="bar-track"><span class="bar-fill" style="--value: ${value}%; --bar-color: ${colors[label] ?? "#2563eb"}"></span></span>
      <span>${value}%</span>
    `;
    bars.appendChild(row);
  });
}

async function analyzeAudio(file) {
  const audioContext = new AudioContext();
  const buffer = await file.arrayBuffer();
  const decoded = await audioContext.decodeAudioData(buffer.slice(0));
  const channel = decoded.getChannelData(0);
  const sampleRate = decoded.sampleRate;
  const step = Math.max(1, Math.floor(channel.length / 60000));
  let sumSquares = 0;
  let zeroCrossings = 0;
  let previous = channel[0] || 0;
  const windowSize = Math.max(256, Math.floor(sampleRate * 0.25));
  const energies = [];
  let windowEnergy = 0;
  let windowCount = 0;

  for (let index = 0; index < channel.length; index += step) {
    const sample = channel[index];
    sumSquares += sample * sample;
    if ((sample >= 0 && previous < 0) || (sample < 0 && previous >= 0)) zeroCrossings += 1;
    previous = sample;
    windowEnergy += sample * sample;
    windowCount += 1;
    if (windowCount >= windowSize / step) {
      energies.push(Math.sqrt(windowEnergy / windowCount));
      windowEnergy = 0;
      windowCount = 0;
    }
  }

  const rms = Math.sqrt(sumSquares / Math.max(1, channel.length / step));
  const zcr = zeroCrossings / Math.max(1, channel.length / step);
  const meanEnergy = energies.reduce((sum, value) => sum + value, 0) / Math.max(1, energies.length);
  const energyVariance =
    energies.reduce((sum, value) => sum + Math.abs(value - meanEnergy), 0) / Math.max(1, energies.length);

  await audioContext.close();

  return {
    energy: clamp(rms * 9),
    variation: clamp(energyVariance * 20),
    sharpness: clamp(zcr * 42),
    duration: decoded.duration,
  };
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = Math.min(Math.max(time, 0), Math.max(0, video.duration - 0.1));
  });
}

async function analyzeVideo(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = reject;
  });

  const context = canvas.getContext("2d", { willReadFrequently: true });
  const width = 180;
  const height = Math.max(100, Math.round((video.videoHeight / video.videoWidth) * width) || 100);
  canvas.width = width;
  canvas.height = height;
  const frameCount = Math.min(10, Math.max(4, Math.floor(video.duration || 6)));
  let brightness = 0;
  let saturation = 0;
  let motion = 0;
  let previousFrame = null;

  for (let i = 0; i < frameCount; i += 1) {
    const time = ((i + 0.5) / frameCount) * Math.max(1, video.duration || frameCount);
    await seekVideo(video, time);
    context.drawImage(video, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    let frameBrightness = 0;
    let frameSaturation = 0;
    let frameMotion = 0;

    for (let p = 0; p < data.length; p += 16) {
      const r = data[p] / 255;
      const g = data[p + 1] / 255;
      const b = data[p + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      frameBrightness += (r + g + b) / 3;
      frameSaturation += max === 0 ? 0 : (max - min) / max;
      if (previousFrame) {
        frameMotion +=
          Math.abs(data[p] - previousFrame[p]) +
          Math.abs(data[p + 1] - previousFrame[p + 1]) +
          Math.abs(data[p + 2] - previousFrame[p + 2]);
      }
    }

    const points = data.length / 16;
    brightness += frameBrightness / points;
    saturation += frameSaturation / points;
    motion += previousFrame ? frameMotion / points / 255 / 3 : 0;
    previousFrame = new Uint8ClampedArray(data);
  }

  URL.revokeObjectURL(url);
  return {
    brightness: clamp(brightness / frameCount),
    saturation: clamp(saturation / frameCount),
    motion: clamp(motion / Math.max(1, frameCount - 1) * 3),
  };
}

function scoreEmotion(audio, video, mode) {
  const audioWeight = mode === "visual" ? 0.25 : mode === "audio" ? 0.9 : 0.55;
  const videoWeight = mode === "audio" ? 0.1 : mode === "visual" ? 0.75 : 0.45;
  const energy = audio?.energy ?? 0.35;
  const variation = audio?.variation ?? 0.25;
  const sharpness = audio?.sharpness ?? 0.25;
  const brightness = video?.brightness ?? 0.55;
  const saturation = video?.saturation ?? 0.35;
  const motion = video?.motion ?? 0.25;

  const scores = {
    "喜悅": audioWeight * (energy * 0.42 + variation * 0.18) + videoWeight * (brightness * 0.22 + saturation * 0.18),
    "期待": audioWeight * (energy * 0.28 + (1 - sharpness) * 0.15) + videoWeight * (saturation * 0.24 + motion * 0.18),
    "專注": audioWeight * ((1 - variation) * 0.24 + energy * 0.16) + videoWeight * ((1 - motion) * 0.26 + brightness * 0.14),
    "平靜": audioWeight * ((1 - energy) * 0.28 + (1 - sharpness) * 0.2) + videoWeight * ((1 - motion) * 0.28),
    "驚訝": audioWeight * (variation * 0.25 + sharpness * 0.15) + videoWeight * (motion * 0.28 + brightness * 0.12),
    "緊張": audioWeight * (sharpness * 0.34 + variation * 0.24) + videoWeight * (motion * 0.17 + (1 - brightness) * 0.11),
  };

  const signals = [];
  if (audio) signals.push(`聲音能量 ${Math.round(energy * 100)}%、語調變化 ${Math.round(variation * 100)}%`);
  if (video) signals.push(`畫面亮度 ${Math.round(brightness * 100)}%、動作變化 ${Math.round(motion * 100)}%`);

  return {
    scores,
    summary: `已完成真實媒體訊號分析。系統根據${signals.join("，")}推估情緒分布；結果適合作為學習展示與初步觀察，正式應用仍需搭配訓練模型與人工脈絡判讀。`,
  };
}

async function analyzeFile(file) {
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/");
  let audio = null;
  let video = null;

  if (isVideo) {
    setStatus("正在分析影片影格...");
    video = await analyzeVideo(file);
  }

  if (isAudio || isVideo) {
    try {
      setStatus("正在分析聲音訊號...");
      audio = await analyzeAudio(file);
    } catch {
      if (!isVideo) throw new Error("此瀏覽器無法解碼這個音訊格式，請改用 MP3 或 WAV。");
    }
  }

  return scoreEmotion(audio, video, modeInput.value);
}

mediaInput.addEventListener("change", () => {
  const file = mediaInput.files?.[0];
  if (!file) return;
  mediaPreview.src = URL.createObjectURL(file);
  mediaPreview.style.display = file.type.startsWith("video/") || file.type.startsWith("audio/") ? "block" : "none";
  setStatus(`已選擇：${file.name}`);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = mediaInput.files?.[0];
  if (!file) {
    setStatus("請先選擇影片或音訊檔，再開始分析。");
    return;
  }

  try {
    form.classList.add("is-busy");
    setStatus("正在讀取媒體檔...");
    const result = await analyzeFile(file);
    renderResults(result);
    setStatus("分析完成。你可以切換分析模式後再次執行。");
  } catch (error) {
    setStatus(error.message || "分析失敗，請換一個影片或音訊檔再試一次。");
  } finally {
    form.classList.remove("is-busy");
  }
});
