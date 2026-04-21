const subjects = [
  { id: "cns", name: "CNS", credits: 3, type: "theory" },
  { id: "cls", name: "CLS", credits: 3, type: "theory" },
  { id: "iot", name: "IOT", credits: 3, type: "theory" },
  { id: "sem", name: "SEM", credits: 3, type: "theory" },
  { id: "ml", name: "ML", credits: 3, type: "theory" },
  { id: "miniProject", name: "Mini Project", credits: 2, type: "theory" },
  { id: "mlLab", name: "ML Lab", credits: 1, type: "lab" },
  { id: "iotLab", name: "IOT Lab", credits: 1, type: "lab" },
  { id: "wpLab", name: "WP Lab", credits: 1, type: "direct" },
];

const gradeBands = [
  { grade: 10, threshold: 90, label: "90+" },
  { grade: 9, threshold: 80, label: "80-89" },
  { grade: 8, threshold: 70, label: "70-79" },
  { grade: 7, threshold: 60, label: "60-69" },
  { grade: 4, threshold: 40, label: "40-59" },
];

const totalCredits = subjects.reduce((sum, subject) => sum + subject.credits, 0);
let latestPlan = null;

const form = document.querySelector("#calculatorForm");
const subjectGrid = document.querySelector("#subjectGrid");
const desiredCgpa = document.querySelector("#desiredCgpa");
const targetPointsText = document.querySelector("#targetPointsText");
const summary = document.querySelector("#summary");
const resultTable = document.querySelector("#resultTable");
const downloadBtn = document.querySelector("#downloadBtn");
const sampleBtn = document.querySelector("#sampleBtn");

function renderSubjectInputs() {
  subjectGrid.innerHTML = subjects
    .map((subject) => {
      const max = subject.type === "direct" ? 100 : 50;
      const label =
        subject.type === "direct"
          ? "WP Lab score out of 100"
          : "Internal marks out of 50";
      const hint =
        subject.type === "direct"
          ? "Directly graded from total score."
          : "External is out of 100, minimum pass is 40, and it is divided by 2 for total.";

      return `
        <article class="subject-card" data-card="${subject.id}">
          <div class="subject-top">
            <div>
              <h3 class="subject-name">${subject.name}</h3>
              <div class="subject-meta">
                <span class="pill">${subject.credits} credit${subject.credits > 1 ? "s" : ""}</span>
                <span class="pill">${subject.type === "direct" ? "direct / 100" : "50 + external/2"}</span>
              </div>
            </div>
            <label class="difficulty">
              <input type="checkbox" name="difficult" value="${subject.id}" />
              Hard
            </label>
          </div>

          <div class="field">
            <label for="${subject.id}Marks">${label}</label>
            <input id="${subject.id}Marks" name="${subject.id}" type="number" min="0" max="${max}" step="0.01" required />
          </div>
          <p class="hint">${hint}</p>
        </article>
      `;
    })
    .join("");
}

function updateTargetText() {
  const cgpa = getDesiredCgpa();
  targetPointsText.textContent = `Target: ${(cgpa * totalCredits).toFixed(1)} / 200 weighted points`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getDesiredCgpa() {
  const value = Number(desiredCgpa.value || 0);
  return clamp(value, 0, 10);
}

function formatDesiredCgpa() {
  desiredCgpa.value = getDesiredCgpa().toFixed(1);
  updateTargetText();
}

function getGradeFromTotal(total) {
  if (total >= 90) return 10;
  if (total >= 80) return 9;
  if (total >= 70) return 8;
  if (total >= 60) return 7;
  if (total >= 40) return 4;
  return 0;
}

function getReliefGrade(desired) {
  return clamp(Math.ceil(desired) - 1, 4, 9);
}

function possibleOptions(subject, enteredMarks) {
  if (subject.type === "direct") {
    const grade = getGradeFromTotal(enteredMarks);
    if (!grade) return [];

    return [
      {
        subject,
        grade,
        threshold: gradeBands.find((band) => band.grade === grade).threshold,
        external: null,
        total: enteredMarks,
        weighted: grade * subject.credits,
        fixed: true,
        possible: true,
      },
    ];
  }

  const optionsByGrade = new Map();

  gradeBands
    .slice()
    .reverse()
    .forEach((band) => {
      const rawExternal = Math.max(40, Math.ceil((band.threshold - enteredMarks) * 2));
      const possible = rawExternal <= 100 && enteredMarks + rawExternal / 2 <= 100;
      if (!possible) return;

      const total = enteredMarks + rawExternal / 2;
      const actualGrade = getGradeFromTotal(total);
      const actualBand = gradeBands.find((item) => item.grade === actualGrade);
      if (!actualBand) return;

      const option = {
        subject,
        grade: actualGrade,
        threshold: actualBand.threshold,
        external: rawExternal,
        total,
        weighted: actualGrade * subject.credits,
        fixed: false,
        possible,
      };
      const current = optionsByGrade.get(actualGrade);
      if (!current || option.external < current.external) {
        optionsByGrade.set(actualGrade, option);
      }
    });

  return Array.from(optionsByGrade.values()).sort((a, b) => a.grade - b.grade);
}

function readInputs() {
  const marks = {};
  for (const subject of subjects) {
    const input = form.elements[subject.id];
    const max = subject.type === "direct" ? 100 : 50;
    const value = clamp(Number(input.value), 0, max);
    input.value = value;
    marks[subject.id] = value;
  }

  const difficult = Array.from(form.querySelectorAll('input[name="difficult"]:checked')).map(
    (input) => input.value
  );

  return {
    marks,
    difficult,
    desired: getDesiredCgpa(),
  };
}

function findBestPlan({ marks, difficult, desired }) {
  const targetPoints = desired * totalCredits;
  const reliefGrade = getReliefGrade(desired);
  const possibleBySubject = subjects.map((subject) => possibleOptions(subject, marks[subject.id]));
  const optionsBySubject = possibleBySubject.map((options) => {
    const subject = options[0]?.subject;
    if (!subject || !difficult.includes(subject.id)) return options;

    const relievedOptions = options.filter((option) => option.grade >= reliefGrade);
    return relievedOptions.length ? relievedOptions : options;
  });

  if (optionsBySubject.some((options) => options.length === 0)) {
    return { ok: false, reason: "Some subjects cannot satisfy the 40-mark minimum external rule with the entered marks." };
  }

  let best = null;

  function scorePlan(plan) {
    const totalPoints = plan.reduce((sum, item) => sum + item.weighted, 0);
    const totalExternal = plan.reduce((sum, item) => sum + (item.external || 0), 0);
    const difficultExternal = plan.reduce(
      (sum, item) => sum + (difficult.includes(item.subject.id) ? item.external || 0 : 0),
      0
    );
    const difficultWeighted = plan.reduce(
      (sum, item) => sum + (difficult.includes(item.subject.id) ? item.weighted : 0),
      0
    );
    const difficultBelowRelief = plan.reduce((sum, item) => {
      if (!difficult.includes(item.subject.id)) return sum;
      return sum + Math.max(0, reliefGrade - item.grade) * item.subject.credits;
    }, 0);
    const difficultAboveRelief = plan.reduce((sum, item) => {
      if (!difficult.includes(item.subject.id)) return sum;
      return sum + Math.max(0, item.grade - reliefGrade) * item.subject.credits;
    }, 0);
    const nonDifficultOverload = plan.reduce((sum, item) => {
      if (difficult.includes(item.subject.id)) return sum;
      return sum + Math.max(0, item.grade - desired) * item.subject.credits;
    }, 0);
    const externalValues = plan
      .filter((item) => !item.fixed)
      .map((item) => item.external || 0);
    const maxExternal = Math.max(...externalValues);
    const minExternal = Math.min(...externalValues);

    return {
      totalPoints,
      cgpa: totalPoints / totalCredits,
      totalExternal,
      difficultExternal,
      difficultWeighted,
      difficultBelowRelief,
      difficultAboveRelief,
      nonDifficultOverload,
      maxExternal,
      externalSpread: maxExternal - minExternal,
      overTarget: totalPoints - targetPoints,
      reliefGrade,
    };
  }

  function isBetter(candidate, current) {
    if (!current) return true;
    const a = candidate.metrics;
    const b = current.metrics;
    const fields = [
      "difficultBelowRelief",
      "difficultAboveRelief",
      "overTarget",
      "nonDifficultOverload",
      "maxExternal",
      "externalSpread",
      "totalExternal",
    ];

    for (const field of fields) {
      if (Math.abs(a[field] - b[field]) > 0.0001) {
        return a[field] < b[field];
      }
    }

    return a.cgpa < b.cgpa;
  }

  function walk(index, plan) {
    if (index === optionsBySubject.length) {
      const metrics = scorePlan(plan);
      if (metrics.totalPoints + 0.0001 < targetPoints) return;
      const candidate = { ok: true, plan: [...plan], metrics, targetPoints };
      if (isBetter(candidate, best)) best = candidate;
      return;
    }

    for (const option of optionsBySubject[index]) {
      plan.push(option);
      walk(index + 1, plan);
      plan.pop();
    }
  }

  walk(0, []);

  if (best) return best;

  const maxPlan = optionsBySubject.map((options) =>
    options.reduce((highest, option) => (option.weighted > highest.weighted ? option : highest), options[0])
  );
  const maxMetrics = scorePlan(maxPlan);

  return {
    ok: false,
    reason: `Target cannot be reached with these marks. Maximum possible CGPA is ${maxMetrics.cgpa.toFixed(2)}.`,
    maxPlan,
    metrics: maxMetrics,
    reliefGrade,
    targetPoints,
  };
}

function validateDifficultyCount() {
  const checked = Array.from(form.querySelectorAll('input[name="difficult"]:checked'));
  const cards = form.querySelectorAll(".subject-card");
  cards.forEach((card) => card.classList.remove("is-difficult"));
  checked.forEach((input) => {
    const card = form.querySelector(`[data-card="${input.value}"]`);
    if (card) card.classList.add("is-difficult");
  });

  if (checked.length > 2) {
    checked[2].checked = false;
    validateDifficultyCount();
  }
}

function renderPlan(result, inputs) {
  latestPlan = result.ok ? { ...result, inputs } : null;
  downloadBtn.disabled = !result.ok;

  if (!result.ok) {
    summary.className = "summary empty-state";
    summary.innerHTML = `<span class="status-bad">${result.reason}</span>`;
    resultTable.innerHTML = "";
    return;
  }

  const difficultNames = inputs.difficult
    .map((id) => subjects.find((subject) => subject.id === id)?.name)
    .filter(Boolean)
    .join(", ");
  const reliefText =
    result.metrics.difficultBelowRelief > 0
      ? `One hard subject could not reach grade ${result.metrics.reliefGrade} with the entered internals, so the planner uses its best feasible grade and balances the gap elsewhere.`
      : `These subjects are planned at grade ${result.metrics.reliefGrade} wherever possible, then the missing points are balanced through other subjects or credit combinations.`;

  summary.className = "summary";
  summary.innerHTML = `
    <div class="summary-grid">
      <div class="metric">
        <span>Planned CGPA</span>
        <strong>${result.metrics.cgpa.toFixed(2)}</strong>
      </div>
      <div class="metric">
        <span>Weighted points</span>
        <strong>${result.metrics.totalPoints.toFixed(0)} / 200</strong>
      </div>
      <div class="metric">
        <span>Total external marks</span>
        <strong>${result.metrics.totalExternal.toFixed(0)}</strong>
      </div>
      <div class="metric">
        <span>Difficult subjects</span>
        <strong>${inputs.difficult.length}/2</strong>
      </div>
      <div class="metric full">
        <span>Strategy</span>
        <strong>${difficultNames || "No difficult subjects selected"}</strong>
        <p class="hint">${reliefText}</p>
      </div>
    </div>
  `;

  resultTable.innerHTML = `
    <div class="result-row header">
      <span>Subject</span>
      <span>Grade</span>
      <span>External</span>
      <span>Points</span>
    </div>
    ${result.plan
      .map((item) => {
        const externalText = item.fixed ? "No exam" : `${item.external}/100`;
        const scoreText = item.fixed
          ? `Direct score: ${item.total}/100`
          : `Needs total ${item.threshold}+ after scaling`;
        const hard = inputs.difficult.includes(item.subject.id) ? "Hard subject" : `${item.subject.credits} credit`;

        return `
          <div class="result-row">
            <span>
              <span class="subject-title">${item.subject.name}</span>
              <span class="subline">${hard}</span>
            </span>
            <span class="${item.grade >= 9 ? "status-good" : "status-warn"}">${item.grade}</span>
            <span>${externalText}</span>
            <span>
              ${item.weighted}
              <span class="subline">${scoreText}</span>
            </span>
          </div>
        `;
      })
      .join("")}
  `;
}

function downloadPdf() {
  if (!latestPlan || !window.jspdf) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const { plan, metrics, inputs } = latestPlan;
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("6th Sem CGPA External Marks Plan", 14, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Desired CGPA: ${inputs.desired.toFixed(1)}`, 14, y);
  y += 7;
  doc.text(`Planned CGPA: ${metrics.cgpa.toFixed(2)} (${metrics.totalPoints.toFixed(0)} / 200 points)`, 14, y);
  y += 7;
  doc.text(`Total minimum external marks: ${metrics.totalExternal.toFixed(0)}`, 14, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("Subject", 14, y);
  doc.text("Credits", 66, y);
  doc.text("Grade", 92, y);
  doc.text("External", 118, y);
  doc.text("Weighted", 158, y);
  y += 7;
  doc.setLineWidth(0.2);
  doc.line(14, y - 4, 196, y - 4);

  doc.setFont("helvetica", "normal");
  plan.forEach((item) => {
    if (y > 275) {
      doc.addPage();
      y = 18;
    }

    const externalText = item.fixed ? "No external" : `${item.external}/100`;
    doc.text(item.subject.name, 14, y);
    doc.text(String(item.subject.credits), 70, y);
    doc.text(String(item.grade), 96, y);
    doc.text(externalText, 118, y);
    doc.text(String(item.weighted), 164, y);
    y += 8;
  });

  doc.save("cgpa-external-plan.pdf");
}

function loadSampleMarks() {
  const sample = {
    cns: 42,
    cls: 38,
    iot: 44,
    sem: 40,
    ml: 36,
    miniProject: 45,
    mlLab: 43,
    iotLab: 41,
    wpLab: 88,
  };

  Object.entries(sample).forEach(([id, value]) => {
    form.elements[id].value = value;
  });

  form.querySelectorAll('input[name="difficult"]').forEach((input) => {
    input.checked = input.value === "ml" || input.value === "cls";
  });
  validateDifficultyCount();
}

function initThreeScene() {
  const canvas = document.querySelector("#orbital-canvas");
  if (!window.THREE || !canvas) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 7);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const group = new THREE.Group();
  scene.add(group);

  group.position.set(3.05, 0.05, -1.55);
  group.rotation.set(-0.18, -0.52, 0.08);

  const coverMaterial = new THREE.MeshStandardMaterial({
    color: 0x2454ff,
    metalness: 0.18,
    roughness: 0.38,
    emissive: 0x07133b,
    emissiveIntensity: 0.46,
  });
  const pageMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7fbff,
    metalness: 0.03,
    roughness: 0.62,
  });
  const pageEdgeMaterial = new THREE.MeshStandardMaterial({
    color: 0xb7e6ff,
    metalness: 0.02,
    roughness: 0.5,
    transparent: true,
    opacity: 0.88,
  });
  const bookmarkMaterial = new THREE.MeshStandardMaterial({
    color: 0x2ee6a6,
    metalness: 0.12,
    roughness: 0.42,
    emissive: 0x0b3c2d,
    emissiveIntensity: 0.65,
  });
  const penMaterial = new THREE.MeshStandardMaterial({
    color: 0x161b2b,
    metalness: 0.36,
    roughness: 0.28,
    emissive: 0x050713,
    emissiveIntensity: 0.36,
  });
  const penAccentMaterial = new THREE.MeshStandardMaterial({
    color: 0x47b7ff,
    metalness: 0.42,
    roughness: 0.22,
    emissive: 0x092940,
    emissiveIntensity: 0.62,
  });
  const penTipMaterial = new THREE.MeshStandardMaterial({
    color: 0xd6e8f5,
    metalness: 0.72,
    roughness: 0.18,
  });

  const lowerCover = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.16, 1.82), coverMaterial);
  lowerCover.position.set(0, -0.12, 0);
  group.add(lowerCover);

  const leftPages = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.12, 1.62), pageMaterial);
  leftPages.position.set(-0.66, 0.03, 0.03);
  leftPages.rotation.z = -0.08;
  group.add(leftPages);

  const rightPages = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.12, 1.62), pageMaterial);
  rightPages.position.set(0.66, 0.03, 0.03);
  rightPages.rotation.z = 0.08;
  group.add(rightPages);

  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 1.9), coverMaterial);
  spine.position.set(0, -0.02, 0);
  group.add(spine);

  const bookmark = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 1.2), bookmarkMaterial);
  bookmark.position.set(0.24, 0.13, -0.08);
  bookmark.rotation.z = 0.05;
  group.add(bookmark);

  const pen = new THREE.Group();
  pen.position.set(0.18, 0.31, 0.12);
  pen.rotation.set(0.1, 0.04, -0.58);
  group.add(pen);

  const penBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.72, 32), penMaterial);
  penBarrel.rotation.z = Math.PI / 2;
  pen.add(penBarrel);

  const penGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.36, 32), penAccentMaterial);
  penGrip.position.x = 0.48;
  penGrip.rotation.z = Math.PI / 2;
  pen.add(penGrip);

  const penCapBand = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.08, 32), penAccentMaterial);
  penCapBand.position.x = -0.62;
  penCapBand.rotation.z = Math.PI / 2;
  pen.add(penCapBand);

  const penTip = new THREE.Mesh(new THREE.ConeGeometry(0.067, 0.22, 32), penTipMaterial);
  penTip.position.x = 0.96;
  penTip.rotation.z = -Math.PI / 2;
  pen.add(penTip);

  const penClip = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.018, 0.045), penAccentMaterial);
  penClip.position.set(-0.38, 0.08, 0.04);
  pen.add(penClip);

  for (let i = 0; i < 7; i += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.012, 0.012), pageEdgeMaterial);
    line.position.set(-0.64, 0.105 + i * 0.009, -0.56 + i * 0.18);
    line.rotation.z = -0.08;
    group.add(line);
  }

  for (let i = 0; i < 7; i += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.012, 0.012), pageEdgeMaterial);
    line.position.set(0.64, 0.105 + i * 0.009, -0.56 + i * 0.18);
    line.rotation.z = 0.08;
    group.add(line);
  }

  const chipMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    metalness: 0.22,
    roughness: 0.35,
    emissive: 0x3f2f08,
    emissiveIntensity: 0.42,
  });

  const chips = [];
  [
    [-1.25, 0.72, -0.62],
    [1.28, 0.68, 0.5],
    [0.12, 0.96, 0.92],
  ].forEach((position) => {
    const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 32), chipMaterial);
    chip.position.set(...position);
    chip.rotation.x = Math.PI / 2;
    group.add(chip);
    chips.push(chip);
  });

  const pointsGeometry = new THREE.BufferGeometry();
  const vertices = [];
  for (let i = 0; i < 780; i += 1) {
    vertices.push((Math.random() - 0.5) * 13, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 9);
  }
  pointsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  const pointsMaterial = new THREE.PointsMaterial({
    color: 0xdaf7ff,
    size: 0.018,
    transparent: true,
    opacity: 0.6,
  });
  const stars = new THREE.Points(pointsGeometry, pointsMaterial);
  scene.add(stars);

  const keyLight = new THREE.PointLight(0x47b7ff, 35, 18);
  keyLight.position.set(4, 3, 4);
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(0x2ee6a6, 18, 14);
  fillLight.position.set(-3, -2, 4);
  scene.add(fillLight);

  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function animate(time) {
    const t = time * 0.001;
    group.rotation.y = -0.52 + Math.sin(t * 0.72) * 0.12;
    group.rotation.x = -0.18 + Math.sin(t * 0.54) * 0.045;
    chips.forEach((chip, index) => {
      chip.position.y = 0.72 + Math.sin(t * 1.4 + index * 1.7) * 0.08;
      chip.rotation.z = t * 0.8 + index;
    });
    stars.rotation.y = t * 0.018;
    group.position.y = Math.sin(t * 0.9) * 0.08;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  window.addEventListener("resize", resize);
  animate(0);
}

renderSubjectInputs();
updateTargetText();
initThreeScene();

desiredCgpa.addEventListener("input", updateTargetText);
desiredCgpa.addEventListener("blur", formatDesiredCgpa);

form.addEventListener("change", (event) => {
  if (event.target.name === "difficult") validateDifficultyCount();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  formatDesiredCgpa();
  const inputs = readInputs();

  if (inputs.difficult.length !== 2) {
    summary.className = "summary empty-state";
    summary.innerHTML = `<span class="status-warn">Please choose exactly two difficult subjects before calculating.</span>`;
    resultTable.innerHTML = "";
    downloadBtn.disabled = true;
    return;
  }

  const result = findBestPlan(inputs);
  renderPlan(result, inputs);
});

sampleBtn.addEventListener("click", loadSampleMarks);
downloadBtn.addEventListener("click", downloadPdf);
