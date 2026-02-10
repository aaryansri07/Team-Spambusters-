let alreadyScanned = false;
document.getElementById('scanBtn').addEventListener('click', async () => {

  if (alreadyScanned) return;

  const btn = document.getElementById('scanBtn');
  const summaryDiv = document.getElementById('summary');
  const verdictDiv = document.getElementById('verdict');
  const safeCountSpan = document.getElementById('safeCount');
  const susCountSpan = document.getElementById('susCount');

  alreadyScanned = true;

  btn.innerText = "Scanning...";
  btn.disabled = true;
  summaryDiv.style.display = 'none';


  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

   /* -------- SCRAPE REVIEWS (AMAZON + FLIPKART) -------- */
const scrapeResult = await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  func: () => {

    const reviews = [];

    /* ---------- AMAZON REVIEWS ---------- */
    const amazonBodies = document.querySelectorAll('[data-hook="review-body"]');
    amazonBodies.forEach((el, index) => {
      const text = el.innerText || el.textContent;
      if (!text) return;

      el.setAttribute('data-senior-id', "a-" + index);

      reviews.push({
        id: "a-" + index,
        text: text.trim()
      });
    });

    /* ---------- FLIPKART REVIEWS ---------- */
    const flipkartBodies = document.querySelectorAll(
      '.t-ZTKy, .ZmyHeo, ._11pzQk'
    );

    flipkartBodies.forEach((el, index) => {
      const text = el.innerText || el.textContent;
      if (!text) return;

      el.setAttribute('data-senior-id', "f-" + index);

      reviews.push({
        id: "f-" + index,
        text: text.trim()
      });
    });

    return reviews;
  }
});


    const reviews = scrapeResult[0].result;
    if (!reviews.length) throw new Error("No reviews found.");

    let safeCount = 0;
    let suspiciousCount = 0;
    let aiFakeCount = 0;

    const analysisResults = [];

    /* -------- ANALYZE REVIEWS -------- */
    for (const review of reviews) {
      let result = await analyzeReview(review.text);

      if (result.label === "GENUINE") safeCount++;
      else if (result.label === "SUSPICIOUS") suspiciousCount++;
      else aiFakeCount++;

      analysisResults.push({
        id: review.id,
        label: result.label,
        score: result.trustScore,
        words: result.suspiciousWords,
        aiWords: result.aiWords,
        reason: result.reason
      });
    }

    /* -------- INJECT UI -------- */
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (results) => {

        results.forEach(item => {

          const el = document.querySelector(`[data-senior-id="${item.id}"]`);
          if (!el) return;

          el.querySelectorAll(".spam-buster-panel").forEach(p => p.remove());

          let textHTML = el.innerText;

          item.words.forEach(word => {
            const regex = new RegExp(`(${word})`, "gi");
            textHTML = textHTML.replace(
              regex,
              `<span style="background:#ff7675;color:white;padding:2px;border-radius:3px;">$1</span>`
            );
          });

          item.aiWords.forEach(word => {
            const regex = new RegExp(`(${word})`, "gi");
            textHTML = textHTML.replace(
              regex,
              `<span style="background:#74b9ff;color:white;padding:2px;border-radius:3px;">$1</span>`
            );
          });

          el.innerHTML = textHTML;

          if (item.label === "GENUINE") {
            el.style.background = "rgba(46,204,113,0.25)";
          } else {
            el.style.background = "rgba(231,76,60,0.25)";
          }

          const panel = document.createElement("div");
          panel.className = "spam-buster-panel";
          panel.style.marginTop = "6px";
          panel.style.padding = "6px";
          panel.style.borderRadius = "6px";
          panel.style.background = "#ffffff";
          panel.style.border = "1px solid #ddd";
          panel.style.fontSize = "12px";

          if (item.label === "GENUINE") {
            panel.innerHTML = `
              <b>Trust Score:</b> ${item.score}/100<br>
              <b>Classification:</b> ${item.label}
            `;
          } else {
            panel.innerHTML = `
              <b>Trust Score:</b> ${item.score}/100<br>
              <b>Classification:</b> ${item.label}<br>
              <b>Explanation:</b> ${item.reason}
            `;
          }

          el.appendChild(panel);
        });

      },
      args: [analysisResults]
    });

    /* -------- GRAPH -------- */
    const graphContainer = document.getElementById("graphBars");
    graphContainer.innerHTML = "";

    analysisResults.forEach(r => {
      const bar = document.createElement("div");
      bar.style.width = "8px";
      bar.style.height = r.score * 0.6 + "px";
      bar.style.borderRadius = "3px";
      bar.style.background =
        r.score >= 70 ? "#2ecc71" :
        r.score >= 40 ? "#f39c12" :
        "#e74c3c";
      graphContainer.appendChild(bar);
    });

  summaryDiv.style.display = 'block';

safeCountSpan.innerText = safeCount;
susCountSpan.innerText = suspiciousCount + aiFakeCount;

/* -------- UPDATE VERDICT -------- */
if (suspiciousCount + aiFakeCount > 0) {
  verdictDiv.innerText = "⚠️ CAREFUL FLAGGED REVIEWS FOUND";
  verdictDiv.classList.add("danger-bg");
  verdictDiv.classList.remove("safe-bg");
} else {
  verdictDiv.innerText = "✅ ALL REVIEWS LOOK GENUINE";
  verdictDiv.classList.add("safe-bg");
  verdictDiv.classList.remove("danger-bg");
}


  } catch (err) {
    btn.innerText = "Error";
  } 
  finally {
  btn.innerText = "Scan complete";
  btn.disabled = true;
}

});


/* -------- IMPROVED AI + TRUST MODEL -------- */

async function analyzeReview(text) {
  const GEMINI_API_KEY = "Paste_Your_Gemini_API_Key_Here";
  const lowerText = text.toLowerCase();

  /* ---------------- WORD LISTS ---------------- */

  const suspiciousWordsList = [
    "must buy","highly recommend","worth every penny",
    "life changing","game changer","mind blowing",
    "five stars","10/10","best product ever",
    "totally worth it","buy this now","perfect product",
    "no complaints","works perfectly","excellent product",
    "very very good","super product","value for money"
  ];

  const aiPhrases = [
    "in conclusion","to summarize","this product provides",
    "efficient performance","seamless experience",
    "overall this product","in summary",
    "this device offers","this product ensures",
    "this product delivers","users will appreciate",
    "designed to provide","it is important to note"
  ];

  const physicalWords = [
    "sweat","ears","hand","pocket","bag","skin",
    "heavy","lightweight","comfortable","fit",
    "battery","noise","temperature","grip"
  ];

  const emotionWords = [
    "love","hate","awesome","terrible","amazing",
    "disappointed","happy","frustrated","excited",
    "awful","perfect","worst","best","impressed",
    "great","fab"
  ];

  const casualWords = [
    "soo","sooo","umm","idk","lol","kinda","bro","ok"
  ];

  const marketingWords = [
    "innovative","premium","ultimate","exceptional",
    "outstanding","revolutionary","high-quality",
    "advanced","remarkable"
  ];

  const experienceWords = [
    "worked","working","works","returned","sent back",
    "broke","stopped","using","used","plugged",
    "installed","connected","charged","opened",
    "tested","tried"
  ];

  const utilityWords = [
    "useful","helpful","handy","convenient",
    "easy","simple","quick","responsive",
    "smooth","reliable"
  ];

  /* ---------------- DETECTION ---------------- */

  const suspiciousWords = suspiciousWordsList.filter(w => lowerText.includes(w));
  const aiDetected = aiPhrases.filter(p => lowerText.includes(p));

  const hasFirstPerson =
    lowerText.includes("i ") ||
    lowerText.includes("my ") ||
    lowerText.includes("me ");

  const hasSpecifics = /\d/.test(text);
  const hasPhysicalContext = physicalWords.some(w => lowerText.includes(w));
  const hasEmotion = emotionWords.some(w => lowerText.includes(w));
  const hasExperience = experienceWords.some(w => lowerText.includes(w));
  const hasUtility = utilityWords.some(w => lowerText.includes(w));

  const hasTypos =
    /[!?]{2,}/.test(text) ||
    casualWords.some(w => lowerText.includes(w));

  /* ---------------- SCORING ENGINE ---------------- */

  let score = 60;
  let reasons = [];

  if (suspiciousWords.length > 0) score -= suspiciousWords.length * 8;

  let aiProb = aiDetected.length * 25;
  if (!hasFirstPerson) aiProb += 20;

  if (aiProb > 40) {
    score -= 25;
    reasons.push("Formal AI-like writing style detected");
  }

  /* ---------------- LENGTH NORMALIZATION ---------------- */

  const wordCount = text.trim().split(/\s+/).length;

  if (wordCount < 6) score -= 15;
  else if (wordCount < 15) score -= 5;
  else if (wordCount > 40 && wordCount < 120) score += 5;

  /* ---------------- HUMAN BONUSES ---------------- */

  if (hasFirstPerson) score += 8;
  if (hasSpecifics) score += 8;
  if (hasPhysicalContext) score += 8;
  if (hasTypos) score += 4;
  if (hasEmotion) score += 4;
  if (hasExperience) score += 6;
  if (hasUtility) score += 5;

  /* ---------------- SHORT REVIEW FORGIVENESS RULE ---------------- */

 /* ---------------- SHORT REVIEW FORGIVENESS RULE ---------------- */

if (wordCount <= 18) {
  let humanSignals = 0;

  if (hasEmotion) humanSignals++;
  if (hasSpecifics) humanSignals++;
  if (hasFirstPerson) humanSignals++;
  if (hasPhysicalContext) humanSignals++;
  if (hasExperience) humanSignals++;
  if (hasUtility) humanSignals++;

  // require stronger human evidence
  if (humanSignals >= 2) {
    score += 8;
    reasons.push("Short real usage review detected");
  }
}


  score = Math.max(5, Math.min(98, score));

  /* ---------------- CATEGORY LOGIC ---------------- */

  let category;

  if (score >= 70) category = "GENUINE";
  else if (score >= 45) category = "SUSPICIOUS";
  else category = "AI / FAKE";

  /* ---------------- GEMINI VERIFICATION ---------------- */

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Audit this review: "${text}". 
              Only return JSON: {"label": "GENUINE" | "SUSPICIOUS" | "AI / FAKE", "reason": "1-sentence reason"}`
            }]
          }],
          generationConfig: { response_mime_type: "application/json" }
        })
      }
    );

    const data = await response.json();

    if (data.candidates && score < 60) {
      const aiRes = JSON.parse(data.candidates[0].content.parts[0].text);
      category = aiRes.label;
      reasons.push("Gemini check: " + aiRes.reason);
    }

  } catch (e) {
    console.log("Gemini fallback to heuristics");
  }

  /* ---------------- FALLBACK REASON ---------------- */

/* ---------------- DYNAMIC FALLBACK REASON ---------------- */

if (reasons.length === 0) {

  if (category === "GENUINE") {
    reasons.push("Natural human review signals detected");
  }

  else if (category === "SUSPICIOUS") {

    if (!hasFirstPerson)
      reasons.push("No personal ownership language");

    if (!hasExperience && !hasPhysicalContext)
      reasons.push("No clear product usage described");

    if (wordCount < 12)
      reasons.push("Very short review");

    if (suspiciousWords.length)
      reasons.push("Contains promotional wording");

    if (reasons.length === 0)
      reasons.push("Generic review structure detected");
  }

  else {
    if (aiDetected.length)
      reasons.push("AI-style phrasing detected");
    else
      reasons.push("Likely generated review pattern");
  }
}


  return {
    label: category,
    trustScore: Math.round(score),
    suspiciousWords,
    aiWords: aiDetected,
    reason: reasons.join(" • ")
  };
}
