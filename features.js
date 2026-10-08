/* Planner, guided sessions, progress, personal check-ins, and portable backups. */
const DRAFT_KEY = `${STORAGE_KEY}Draft`;
let circuit = null;
let circuitTimer = null;
let chartMetric = "steps";
let toastTimer;
let selectedMood = state.habits.mood;
let editingWorkoutId = null;
const uid = () => crypto.randomUUID();
const timeLabel = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const totalWorkoutMinutes = day => (day.workouts || []).reduce((sum, workout) => sum + Number(workout.minutes || 0), 0);
const totalWater = day => (day.habits?.water || []).reduce((sum, value) => sum + Number(value), 0);

function toast(message) {
  clearTimeout(toastTimer);
  byId("toast").textContent = message;
  byId("toast").hidden = false;
  toastTimer = setTimeout(() => { byId("toast").hidden = true; }, 3500);
}

function exerciseIllustration(id) {
  const shapes = {
    "arm-curls": '<path d="M80 62 L60 88 L43 65" class="demo-limb"/><path d="M81 63 L101 84 L118 63"/>',
    "arm-raises": '<path d="M80 63 L51 41 L35 17" class="demo-limb"/><path d="M82 64 L111 41 L127 17"/>',
    "march": '<path d="M80 65 L58 85 L40 70 M82 65 L103 48 L117 65"/><path d="M80 94 L60 105 L69 130 M80 94 L100 117 L119 117" class="demo-limb"/>',
    "chair-squats": '<path d="M81 94 L110 94 L112 129 M59 85 H91 M60 85 V130 M93 85 V130"/><path d="M80 64 L106 72" class="demo-limb"/>',
    "wall-pushups": '<path d="M80 63 L115 66 L135 52" class="demo-limb"/><path d="M136 23 V129 M80 94 L60 129 M80 94 L85 129"/>',
    "calf-raises": '<path d="M80 64 L55 82 M80 64 L104 82 M80 94 L69 123 L84 123 M80 94 L99 123 L113 123" class="demo-limb"/>',
    "shoulder-rolls": '<path d="M80 62 L57 80 L51 98 M80 62 L103 80 L109 98" class="demo-limb"/><path d="M43 43 Q43 24 61 25 M61 25 L55 18 M61 25 L54 32" stroke-width="3"/>',
    "floor-stretch": '<path d="M80 64 L58 85 L40 66 M80 64 L105 43 L120 32" class="demo-limb"/><path d="M80 94 L102 94 L108 128 M57 95 H98 M58 95 V130"/>',
  };
  const legs = ["chair-squats", "march", "wall-pushups", "calf-raises", "floor-stretch"].includes(id) ? "" : '<path d="M80 94 L64 129 M80 94 L97 129"/>';
  return `<svg viewBox="0 0 160 145" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="80" cy="133" rx="52" ry="4" fill="currentColor" opacity=".08"/><circle cx="80" cy="40" r="12" fill="currentColor"/><g stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M80 57 V94"/>${shapes[id] || shapes["arm-raises"]}${legs}</g></svg>`;
}

function showExerciseDemo(id) { byId("exercise-demo").innerHTML = exerciseIllustration(id); }

function dateAtOffset(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function rangeDays(count) {
  const days = new Map(state.history.map(day => [day.date, day]));
  days.set(state.date, state);
  return Array.from({ length: count }, (_, index) => {
    const date = dateAtOffset(index - count + 1);
    return days.get(date) || { date, steps: 0, activeSeconds: 0, workouts: [], habits: { water: [] }, missing: true };
  });
}

function movementStreak() {
  const days = rangeDays(31).reverse();
  let count = 0;
  // A day still in progress doesn't break yesterday's streak.
  if (!days[0].steps && !days[0].workouts.length) days.shift();
  for (const day of days) {
    if (!day.steps && !day.workouts.length) break;
    count += 1;
  }
  return count;
}

function renderBars(container, days, metric, interactive = false) {
  const values = days.map(day => metric === "steps" ? day.steps : totalWorkoutMinutes(day));
  const max = Math.max(...values, 1);
  container.replaceChildren();
  container.classList.toggle("range-30", days.length === 30);
  days.forEach((day, index) => {
    const date = new Date(`${day.date}T12:00:00`);
    const value = values[index];
    const label = `${day.date}: ${metric === "steps" ? formatNumber(value) + " steps" : value.toFixed(1) + " workout minutes"}${day.missing ? " (no record)" : ""}`;
    const column = document.createElement("div");
    column.className = `chart-column${day.date === state.date ? " is-today" : ""}`;
    column.dataset.tooltip = label;
    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.style.height = `${Math.max(2, value / max * 100)}%`;
    if (interactive) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", label);
      button.title = label;
      button.append(bar);
      column.append(button);
    } else {
      column.append(bar);
      column.title = label;
    }
    const text = document.createElement("span");
    text.textContent = days.length <= 7 ? date.toLocaleDateString("en", { weekday: "short" }).slice(0, 2) : index % 5 === 0 || index === days.length - 1 ? date.getDate() : "";
    column.append(text);
    container.append(column);
  });
  container.setAttribute("aria-label", `${metric === "steps" ? "Walking steps" : "Workout minutes"} over ${days.length} days. ${values.every(value => value === 0) ? "No activity logged yet." : "Daily numbers available in the table below."}`);
}

function renderExperience() {
  const week = rangeDays(7);
  const active = week.filter(day => day.steps > 0 || day.workouts.length).length;
  renderBars(byId("week-chart"), week, "steps");
  byId("active-days").textContent = `${active} active ${active === 1 ? "day" : "days"}`;
  const minutes = totalWorkoutMinutes(state);
  byId("workout-goal-label").textContent = `${minutes.toFixed(1)} / ${state.preferences.workoutGoal} min`;
  byId("workout-goal-bar").style.width = `${Math.min(100, minutes / state.preferences.workoutGoal * 100)}%`;
  const hasMovement = state.steps > 0 || state.workouts.length > 0;
  byId("focus-heading").textContent = hasMovement ? "You're building momentum" : "Make your first move";
  byId("focus-copy").textContent = hasMovement ? `${formatNumber(state.steps)} steps and ${state.workouts.length} completed workouts today. Keep making time for what feels right.` : "Pick an exercise or start a walk. Every entry builds your story.";
  const milestones = [
    ["First workout", state.workouts.length > 0], ["Step target", state.steps >= state.settings.stepGoal],
    ["3 active days", active >= 3], ["Time target", minutes >= state.preferences.workoutGoal]
  ];
  byId("milestone-list").replaceChildren(...milestones.map(([name, earned]) => {
    const badge = document.createElement("span"); badge.className = `milestone${earned ? " earned" : ""}`; badge.textContent = `${earned ? "✓ " : "○ "}${name}`; return badge;
  }));
  const water = totalWater(state);
  byId("water-total").textContent = formatNumber(water);
  byId("water-progress").style.width = `${Math.min(100, water / state.preferences.waterGoal * 100)}%`;
  byId("water-goal-label").textContent = `Personal target: ${formatNumber(state.preferences.waterGoal)} ml`;
  byId("water-undo").disabled = !state.habits.water.length;
  document.querySelectorAll("[data-mood]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mood === selectedMood)));
  const days = rangeDays(Number(byId("progress-range").value));
  byId("progress-steps").textContent = formatNumber(days.reduce((sum, day) => sum + day.steps, 0));
  byId("progress-workouts").textContent = days.reduce((sum, day) => sum + day.workouts.length, 0);
  byId("progress-minutes").textContent = days.reduce((sum, day) => sum + totalWorkoutMinutes(day), 0).toFixed(1);
  byId("progress-streak").textContent = movementStreak();
  renderBars(byId("trend-chart"), days, chartMetric, true);
  byId("trend-caption").textContent = `Today included · ${days.filter(day => !day.missing).length} days with saved records · blank dates mean no record, not verified inactivity.`;
  byId("progress-table").replaceChildren(...days.slice().reverse().map(day => {
    const row = document.createElement("tr");
    [day.date, day.missing ? "—" : formatNumber(day.steps), day.missing ? "—" : day.workouts.length, day.missing ? "—" : totalWorkoutMinutes(day).toFixed(1), day.missing ? "—" : totalWater(day)].forEach(value => {
      const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
    }); return row;
  }));
  updateCircuitEstimate();
}

function decorateWorkoutRows() {
  byId("completed-workouts").querySelectorAll("li").forEach((row, index) => {
    const workout = state.workouts[index];
    const actions = document.createElement("div"); actions.className = "entry-actions";
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "text-button"; edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${workout.name}`);
    edit.addEventListener("click", () => {
      editingWorkoutId = workout.id;
      const form = byId("workout-edit-form");
      for (const key of ["id", "name", "reps", "sets", "minutes", "note"]) form.elements[key].value = workout[key] ?? "";
      byId("edit-message").textContent = "";
      byId("workout-edit-dialog").showModal();
    });
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "text-button"; remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${workout.name}`);
    remove.addEventListener("click", () => {
      if (!confirm(`Delete the completed workout “${workout.name}”?`)) return;
      state.workouts = state.workouts.filter(item => item.id !== workout.id); saveState(); renderSports(); toast("Workout deleted.");
    });
    actions.append(edit, remove); row.append(actions);
  });
}

function decorateWalkingRows() {
  byId("session-list").querySelectorAll("li").forEach((row, index) => {
    const session = state.sessions[index];
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "text-button"; remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete walking entry of ${session.steps} steps`);
    remove.addEventListener("click", () => {
      if (!confirm(`Delete this ${session.steps}-step walking entry and subtract it from today's totals?`)) return;
      state.steps = Math.max(0,state.steps - session.steps); state.activeSeconds = Math.max(0,state.activeSeconds - session.activeSeconds);
      state.sessions.splice(state.sessions.indexOf(session),1); saveState(); updateOutputs(); toast("Walking entry deleted and totals updated.");
    }); row.append(remove);
  });
}

function addCustomExerciseControls(card, exercise) {
  const top = card.querySelector(".exercise-top");
  const actions = document.createElement("div"); actions.className = "exercise-top-actions";
  actions.append(top.querySelector(".favorite-button"));
  const remove = document.createElement("button"); remove.className = "custom-remove"; remove.type = "button"; remove.textContent = "×";
  remove.setAttribute("aria-label", `Remove custom exercise ${exercise.name}`);
  remove.addEventListener("click", () => {
    if (circuit || permissionPending) { toast("Finish the active session or permission request first."); return; }
    if (!confirm(`Remove “${exercise.name}” from your library and plan? Its completed workout records will be kept.${selectedExercise?.id === exercise.id && workoutDraftDirty ? " The current unsaved entry will be discarded." : ""}`)) return;
    if (selectedExercise?.id === exercise.id) { resetWorkoutDraft(); selectedExercise = null; byId("workout-form").hidden = true; byId("selected-workout-name").textContent = "Choose your first exercise"; }
    state.customExercises = state.customExercises.filter(item=>item.id !== exercise.id);
    state.plan = state.plan.filter(id=>id !== exercise.id); state.favorites = state.favorites.filter(id=>id !== exercise.id);
    exercises.splice(exercises.findIndex(item=>item.id === exercise.id),1); saveState(); renderSports(); toast("Custom exercise removed. Completed records kept.");
  }); actions.append(remove); top.append(actions);
}

function decoratePlan() {
  byId("workout-plan").querySelectorAll("li").forEach((row, index) => {
    const controls = document.createElement("div"); controls.className = "plan-order";
    [-1, 1].forEach(direction => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = direction < 0 ? "↑" : "↓";
      button.setAttribute("aria-label", `Move ${exercises.find(exercise => exercise.id === state.plan[index])?.name} ${direction < 0 ? "up" : "down"}`);
      button.disabled = index + direction < 0 || index + direction >= state.plan.length || Boolean(circuit);
      button.addEventListener("click", () => {
        [state.plan[index], state.plan[index + direction]] = [state.plan[index + direction], state.plan[index]];
        saveState(); renderSports();
      }); controls.append(button);
    }); row.insertBefore(controls, row.lastChild);
  });
  byId("plan-clear").disabled = !state.plan.length || Boolean(circuit);
  updateCircuitEstimate();
}

function updateCircuitEstimate() {
  const work = Number(byId("circuit-work").value);
  const rest = Number(byId("circuit-rest").value);
  const rounds = Number(byId("circuit-rounds").value);
  const intervals = state.plan.length * rounds;
  const seconds = intervals * work + Math.max(0, intervals - 1) * rest;
  byId("circuit-estimate").textContent = state.plan.length ? `${state.plan.length} exercises · ${rounds} ${rounds === 1 ? "round" : "rounds"} · about ${(seconds / 60).toFixed(1)} min including rest` : "Add an exercise to your plan to begin.";
  byId("circuit-start").disabled = !state.plan.length;
}

function setCircuitRunning(running) {
  if (!circuit) return;
  circuit.running = running;
  circuit.lastTick = Date.now();
  byId("circuit-pause").textContent = running ? "Pause session" : "Resume session";
}

function renderCircuit() {
  if (!circuit) return;
  const interval = circuit.intervals[circuit.index];
  const seconds = Math.ceil(circuit.remaining / 1000);
  byId("circuit-phase").textContent = `${circuit.running ? "" : "PAUSED · "}${interval.rest ? "REST & RESET" : "YOUR MOVEMENT"}`;
  byId("circuit-name").textContent = interval.rest ? "Take a breather" : interval.exercise.name;
  byId("circuit-countdown").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  byId("circuit-position").textContent = `Round ${interval.round} of ${circuit.rounds} · Interval ${circuit.index + 1} of ${circuit.intervals.length}`;
  byId("circuit-progress").style.width = `${(circuit.index + 1 - circuit.remaining / interval.duration) / circuit.intervals.length * 100}%`;
  const next = circuit.intervals.slice(circuit.index + 1).find(item => !item.rest);
  byId("circuit-next").textContent = next ? `Up next: ${next.exercise.name}` : "Last movement. Finish at your own pace.";
}

function tickCircuit() {
  if (!circuit || !circuit.running || byId("circuit-review-dialog").open) return;
  const now = Date.now();
  const delta = Math.min(Math.max(0, now - circuit.lastTick), circuit.remaining);
  circuit.lastTick = now;
  const interval = circuit.intervals[circuit.index];
  if (!interval.rest && delta > 0) {
    const record = circuit.records.get(interval.exercise.id) || { exercise: interval.exercise, ms: 0, rounds: new Set() };
    record.ms += delta; record.rounds.add(interval.round); circuit.records.set(interval.exercise.id, record);
  }
  circuit.remaining -= delta;
  if (circuit.remaining <= 0) {
    circuit.index += 1;
    if (circuit.index >= circuit.intervals.length) { finishCircuit(false); return; }
    circuit.remaining = circuit.intervals[circuit.index].duration;
  }
  renderCircuit();
}

function finishCircuit(captureTime = true) {
  if (!circuit) return;
  if (captureTime) tickCircuit();
  if (!circuit) return;
  setCircuitRunning(false);
  clearInterval(circuitTimer);
  const records = [...circuit.records.values()].filter(record => record.ms >= 1000);
  if (!records.length) { clearCircuit(); toast("Session ended. No completed work time to save yet."); return; }
  byId("circuit-review-rows").replaceChildren(...records.map(record => {
    const row = document.createElement("div"); row.className = "circuit-review-row"; row.dataset.exerciseId = record.exercise.id;
    const title = document.createElement("strong"); title.textContent = record.exercise.name;
    const fields = document.createElement("div"); fields.className = "settings-grid";
    [["Minutes", "minutes", Number((record.ms / 60000).toFixed(2)), "0.01", "0.01", "1440"], ["Total reps", "reps", 0, "1", "0", "10000"]].forEach(([labelText, name, value, step, min, max]) => {
      const label = document.createElement("label"); label.textContent = labelText;
      const input = document.createElement("input"); input.name = name; input.type = "number"; input.value = value; input.min = min; input.max = max; input.step = step; input.required = true;
      label.append(input); fields.append(label);
    }); row.append(title, fields); return row;
  }));
  byId("circuit-review-message").textContent = "";
  byId("circuit-review-dialog").showModal();
}

function clearCircuit() {
  circuit = null; clearInterval(circuitTimer);
  byId("circuit-idle").hidden = false; byId("circuit-live").hidden = true;
  byId("circuit-review-dialog").close();
  byId("circuit-message").textContent = "";
  decoratePlan();
}

function endCircuitForNewDay() {
  if (!circuit) return;
  // Completed work belongs to the old day; no rest or uncompleted intervals are added.
  tickCircuit();
  if (!circuit) return;
  for (const record of circuit.records.values()) {
    if (record.ms < 1000) continue;
    state.workouts.unshift({ id: uid(), exerciseId: record.exercise.id, name: record.exercise.name, minutes: Number((record.ms / 60000).toFixed(2)), reps: 0, sets: record.rounds.size, source: "circuit", note: "Completed interval time saved at daily rollover; reps not counted.", time: timeLabel() });
  }
  clearCircuit(); toast("Your completed session time was saved to the previous day.");
}

byId("circuit-start").addEventListener("click", () => {
  ensureCurrentDay();
  if (tracking || workoutRunning || permissionPending || workoutDraftDirty) { toast("Finish or clear your current tracker entry before starting a guided session."); return; }
  const fields = ["circuit-work", "circuit-rest", "circuit-rounds"].map(byId);
  if (!fields.every(field => field.reportValidity()) || !state.plan.length) return;
  const [work, rest, rounds] = fields.map(field => Number(field.value));
  state.routineSettings = { work, rest, rounds }; saveState();
  const intervals = [];
  for (let round = 1; round <= rounds; round += 1) {
    state.plan.forEach(id => {
      const exercise = exercises.find(item => item.id === id);
      if (!exercise) return;
      if (intervals.length && rest > 0) intervals.push({ rest: true, duration: rest * 1000, round });
      intervals.push({ exercise: structuredClone(exercise), duration: work * 1000, round });
    });
  }
  if (!intervals.length) return;
  circuit = { intervals, index: 0, remaining: intervals[0].duration, records: new Map(), rounds, running: true, lastTick: Date.now() };
  byId("circuit-idle").hidden = true; byId("circuit-live").hidden = false;
  byId("circuit-pause").textContent = "Pause session";
  renderCircuit(); decoratePlan();
  circuitTimer = setInterval(tickCircuit, 100);
});
byId("circuit-pause").addEventListener("click", () => {
  if (!circuit) return;
  if (circuit.running) tickCircuit();
  if (!circuit || byId("circuit-review-dialog").open) return;
  setCircuitRunning(!circuit.running); renderCircuit();
});
byId("circuit-skip").addEventListener("click", () => {
  if (!circuit) return;
  tickCircuit();
  if (!circuit || byId("circuit-review-dialog").open) return;
  circuit.index += 1;
  if (circuit.index >= circuit.intervals.length) { finishCircuit(false); return; }
  circuit.remaining = circuit.intervals[circuit.index].duration;
  circuit.lastTick = Date.now(); renderCircuit();
});
byId("circuit-finish").addEventListener("click", () => finishCircuit());
byId("circuit-review-dialog").addEventListener("cancel", event => event.preventDefault());
byId("circuit-discard").addEventListener("click", () => { if (confirm("Discard the completed time from this session?")) clearCircuit(); });
byId("circuit-review-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!circuit) return;
  const sessionId = uid();
  byId("circuit-review-rows").querySelectorAll(".circuit-review-row").forEach(row => {
    const record = circuit.records.get(row.dataset.exerciseId);
    state.workouts.unshift({ id: uid(), sessionId, exerciseId: record.exercise.id, name: record.exercise.name, minutes: Number(row.querySelector('[name="minutes"]').value), reps: Number(row.querySelector('[name="reps"]').value), sets: record.rounds.size, source: "circuit", time: timeLabel(), note: "Guided intervals · work time only" });
  });
  clearCircuit(); saveState(); renderSports(); toast("Session saved. Your effort is in the log.");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && circuit?.running) {
    tickCircuit(); setCircuitRunning(false); renderCircuit();
    byId("circuit-message").textContent = "Session paused because this page was hidden. Resume when ready.";
  }
});
window.addEventListener("beforeunload", event => { if (circuit) { event.preventDefault(); event.returnValue = ""; } });
for (const name of ["work", "rest", "rounds"]) {
  byId(`circuit-${name}`).value = state.routineSettings[name];
  byId(`circuit-${name}`).addEventListener("input", updateCircuitEstimate);
}

const presets = { mobility: ["shoulder-rolls", "arm-raises", "floor-stretch"], strength: ["chair-squats", "wall-pushups", "calf-raises"], mixed: ["march", "arm-curls", "shoulder-rolls", "floor-stretch"] };
document.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => {
  if (circuit) { toast("Finish your current guided session before replacing the plan."); return; }
  if (state.plan.length && !confirm("Replace your current workout plan with this example? Completed workouts are kept.")) return;
  state.plan = [...presets[button.dataset.preset]]; saveState(); renderSports(); toast("Plan loaded. Reorder it or add your own exercises.");
}));
byId("plan-clear").addEventListener("click", () => {
  if (circuit || !state.plan.length || !confirm("Clear your workout plan? Completed workouts are kept.")) return;
  state.plan = []; saveState(); renderSports();
});
byId("exercise-search").addEventListener("input", renderLibrary);
byId("custom-exercise-open").addEventListener("click", () => { byId("custom-exercise-message").textContent = ""; byId("custom-exercise-dialog").showModal(); });
document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
byId("custom-exercise-form").addEventListener("submit", event => {
  event.preventDefault();
  if (state.customExercises.length >= 50) { byId("custom-exercise-message").textContent = "You can keep up to 50 custom exercises."; return; }
  const data = new FormData(event.currentTarget);
  const name = String(data.get("name")).trim();
  const instructions = String(data.get("instructions")).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!name || !instructions.length) { byId("custom-exercise-message").textContent = "Enter a name and at least one instruction."; return; }
  const exercise = { id: `custom-${uid()}`, name, instructions, group: data.get("group"), motion: false, custom: true, icon: "↗", target: "Your exercise · timer / manual", description: instructions[0].slice(0, 100) };
  state.customExercises.push(exercise); exercises.push(exercise); state.plan.push(exercise.id);
  byId("exercise-search").value = ""; byId("workout-filter").value = "all";
  saveState(); renderSports(); event.currentTarget.reset(); byId("custom-exercise-dialog").close(); toast("Your exercise is ready and added to the plan.");
});
byId("workout-edit-form").addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const workout = state.workouts.find(item => item.id === editingWorkoutId);
  if (!workout) { byId("edit-message").textContent = "This workout is no longer in today's records."; return; }
  const name = String(data.get("name")).trim();
  const reps = Number(data.get("reps")), minutes = Number(data.get("minutes"));
  if (!name || (!reps && !minutes)) { byId("edit-message").textContent = "Enter a name and some reps or workout time."; return; }
  Object.assign(workout, { name, reps, minutes, sets: Number(data.get("sets")), note: String(data.get("note")).trim() });
  saveState(); renderSports(); byId("workout-edit-dialog").close(); toast("Workout updated.");
});
byId("rep-plus").addEventListener("click", () => adjustReps(1));
byId("rep-minus").addEventListener("click", () => adjustReps(-1));
function adjustReps(delta) {
  if (workoutRunning && byId("workout-method").value === "motion") { toast("Pause motion counting before correcting reps."); return; }
  workoutMovements = Math.max(0, Math.min(10000, Number(byId("workout-rep-input").value) + delta));
  byId("workout-rep-input").value = workoutMovements; byId("workout-live-reps").textContent = workoutMovements; workoutDraftDirty = true; persistDraft();
}

document.querySelectorAll("[data-water]").forEach(button => button.addEventListener("click", () => {
  ensureCurrentDay();
  if (totalWater(state) + Number(button.dataset.water) > 20000) { toast("Daily log limit reached. Check your entries."); return; }
  state.habits.water.push(Number(button.dataset.water)); saveState(); toast(`${button.dataset.water} ml added.`);
}));
byId("water-undo").addEventListener("click", () => { ensureCurrentDay(); state.habits.water.pop(); saveState(); });
document.querySelectorAll("[data-mood]").forEach(button => button.addEventListener("click", () => {
  selectedMood = button.dataset.mood; renderExperience();
}));
byId("mood-note").value = state.habits.note;
byId("save-mood").addEventListener("click", () => {
  ensureCurrentDay(); state.habits.mood = selectedMood; state.habits.note = byId("mood-note").value.trim(); saveState(); toast("Check-in saved.");
});
byId("manual-walk-form").addEventListener("submit", event => {
  event.preventDefault(); ensureCurrentDay();
  const data = new FormData(event.currentTarget); const steps = Number(data.get("steps")), seconds = Number(data.get("minutes")) * 60;
  if (state.steps + steps > 1000000) { byId("manual-walk-message").textContent = "Daily step limit reached. Check the number entered."; return; }
  state.steps += steps; state.activeSeconds += seconds;
  state.sessions.unshift({ id: uid(), source: "manual", steps, activeSeconds: seconds, time: timeLabel() });
  saveState(); updateOutputs(); event.currentTarget.reset(); byId("manual-walk-message").textContent = "Walking entry added to today's totals.";
});
for (const key of ["waterGoal", "workoutGoal"]) byId("preferences-form").elements[key].value = state.preferences[key];
byId("preferences-form").addEventListener("submit", event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  state.preferences.waterGoal = Number(data.get("waterGoal")); state.preferences.workoutGoal = Number(data.get("workoutGoal")); saveState(); toast("Personal targets saved.");
});
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  byId("theme-toggle").setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
  document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#171e1a" : "#f4f5f0";
}
setTheme(state.preferences.theme);
byId("theme-toggle").addEventListener("click", () => { state.preferences.theme = state.preferences.theme === "dark" ? "light" : "dark"; setTheme(state.preferences.theme); saveState(); });
byId("progress-range").addEventListener("change", renderExperience);
document.querySelectorAll("[data-chart-metric]").forEach(button => button.addEventListener("click", () => {
  chartMetric = button.dataset.chartMetric;
  document.querySelectorAll("[data-chart-metric]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
  renderExperience();
}));

function persistDraft() {
  if (!selectedExercise || !workoutDraftDirty) return;
  const draft = { date: state.date, exerciseId: selectedExercise.id, elapsed: elapsedWorkoutMs(), reps: Number(byId("workout-rep-input").value), sets: Number(byId("workout-set-input").value), minutes: Number(byId("workout-minute-input").value), note: byId("workout-note").value, method: byId("workout-method").value, source: workoutSource };
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }
  catch { byId("storage-warning").hidden = false; }
}
window.addEventListener("move:draft-cleared", () => { try { localStorage.removeItem(DRAFT_KEY); } catch {} });
byId("workout-form").addEventListener("input", persistDraft);
window.addEventListener("pagehide", persistDraft);
document.addEventListener("visibilitychange", () => { if (document.hidden) persistDraft(); });
setInterval(persistDraft, 1500);

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (!draft || draft.date !== state.date || !exercises.some(exercise => exercise.id === draft.exerciseId)) return;
    if (![draft.elapsed, draft.reps, draft.sets, draft.minutes].every(Number.isFinite) || draft.reps < 0 || draft.reps > 10000 || draft.sets < 1 || draft.sets > 100 || draft.elapsed < 0 || draft.elapsed > 86400000) return;
    chooseExercise(draft.exerciseId);
    workoutElapsedMs = draft.elapsed; workoutMovements = draft.reps; workoutSource = draft.source;
    byId("workout-rep-input").value = draft.reps; byId("workout-set-input").value = draft.sets;
    byId("workout-minute-input").value = draft.minutes; byId("workout-note").value = String(draft.note || "").slice(0,160);
    byId("workout-method").value = ["motion", "timer", "manual"].includes(draft.method) && (draft.method !== "motion" || selectedExercise.motion) ? draft.method : "manual";
    updateWorkoutMethod(); workoutSource = draft.source; workoutDraftDirty = true;
    byId("workout-clock").textContent = `${String(Math.floor(draft.elapsed / 60000)).padStart(2,"0")}:${String(Math.floor(draft.elapsed / 1000) % 60).padStart(2,"0")}`;
    byId("workout-live-reps").textContent = draft.reps; byId("draft-restored").hidden = false;
    byId("workout-start").textContent = "Resume workout"; openTab("sports"); persistDraft();
  } catch { /* A corrupt draft never blocks the completed records. */ }
}

function downloadText(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type })); const link = document.createElement("a");
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
try { storageRecovery ||= localStorage.getItem(`${STORAGE_KEY}Recovery`); } catch {}
byId("recovery-warning").hidden = !storageRecovery;
byId("download-recovery").addEventListener("click", () => { if (storageRecovery) downloadText(storageRecovery, `ar-move-recovery-${state.date}.json`, "application/json"); });
byId("dismiss-recovery").addEventListener("click", () => {
  byId("recovery-warning").hidden = true;
  storageRecovery = null;
  try { localStorage.removeItem(`${STORAGE_KEY}Recovery`); } catch {}
});
byId("export-csv").addEventListener("click", () => {
  ensureCurrentDay();
  const rows = [["date","steps","active_minutes","workouts","workout_minutes","water_ml","mood"], ...[...state.history, daySnapshot(state)].sort((a,b) => a.date.localeCompare(b.date)).map(day => [day.date, day.steps, (day.activeSeconds / 60).toFixed(1), day.workouts.length, totalWorkoutMinutes(day).toFixed(2), totalWater(day), day.habits?.mood || ""] )];
  downloadText(rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(",")).join("\r\n"), `ar-move-daily-${state.date}.csv`, "text/csv;charset=utf-8");
});

// Backups are data only. Validate their complete shape before mutating live state.
function validateBackup(data) {
  const fail = () => { throw new Error("This backup has invalid or unsupported records. Nothing was changed."); };
  const number = (value, min, max, integer = false) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
  const text = (value, max) => typeof value === "string" && value.length <= max;
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value;
  if (!data || data.app !== "AR Move" || (data.version != null && data.version !== 3) || !data.today || !Array.isArray(data.history) || data.history.length > 30 || !Array.isArray(data.plan) || data.plan.length > 100) fail();
  const validateDay = day => {
    if (!day || !validDate(day.date) || day.date > localDateKey() || !number(day.steps,0,1000000,true) || !number(day.activeSeconds,0,86400 * 10) || !Array.isArray(day.sessions) || day.sessions.length > 10000 || !Array.isArray(day.workouts) || day.workouts.length > 10000) fail();
    const sessions = day.sessions.map(item => {
      if (!item || !number(item.steps,0,1000000,true) || !number(item.activeSeconds,0,86400 * 10) || !text(item.time,30)) fail();
      return { id: uid(), steps:item.steps, activeSeconds:item.activeSeconds, source:item.source === "manual" ? "manual" : "motion", time:item.time };
    });
    const workouts = day.workouts.map(item => {
      if (!item || !text(item.name,60) || !item.name.trim() || !number(item.reps,0,10000,true) || !number(item.sets,1,100,true) || !number(item.minutes,0,1440) || !text(item.exerciseId,100) || !text(item.time,30) || (item.note != null && !text(item.note,160))) fail();
      return { id:uid(), name:item.name, exerciseId:item.exerciseId, reps:item.reps, sets:item.sets, minutes:item.minutes, source:["motion","timer","circuit"].includes(item.source) ? item.source : "manual", time:item.time, note:item.note || "" };
    });
    const settings = day.settings || {};
    if (![number(settings.weight,25,250), number(settings.stride,30,150), number(settings.stepGoal,100,100000,true), [1.05,1.25,1.5].includes(settings.sensitivity)].every(Boolean)) fail();
    const wellness = freshState().wellness;
    for (const key of Object.keys(wellness)) {
      const value = day.wellness?.[key]; if (value != null) { if (!text(value,30)) fail(); wellness[key] = value; }
    }
    const habits = { water:[], mood:"", note:"" };
    if (day.habits != null) {
      if (!Array.isArray(day.habits.water) || day.habits.water.length > 1000 || !day.habits.water.every(value => number(value,1,20000,true)) || totalWater(day) > 20000 || !["","low","okay","good","great"].includes(day.habits.mood) || !text(day.habits.note,160)) fail();
      Object.assign(habits, { water:[...day.habits.water], mood:day.habits.mood, note:day.habits.note });
    }
    return { date:day.date, steps:day.steps, activeSeconds:day.activeSeconds, sessions, workouts, settings:{ weight:settings.weight, stride:settings.stride, stepGoal:settings.stepGoal, sensitivity:settings.sensitivity }, wellness, habits };
  };
  const today = validateDay(data.today);
  const history = data.history.map(validateDay);
  if (new Set([today.date,...history.map(day => day.date)]).size !== history.length + 1) fail();
  const customExercises = (data.customExercises || []);
  if (!Array.isArray(customExercises) || customExercises.length > 50) fail();
  const custom = customExercises.map(item => {
    if (!item || !/^custom-[a-zA-Z0-9-]{1,80}$/.test(item.id) || !text(item.name,60) || !item.name.trim() || !["strength","mobility","cardio"].includes(item.group) || !Array.isArray(item.instructions) || !item.instructions.length || item.instructions.length > 30 || !item.instructions.every(line => text(line,600))) fail();
    return { id:item.id, name:item.name, group:item.group, custom:true, motion:false, instructions:[...item.instructions], description:item.instructions[0].slice(0,100), target:"Your exercise · timer / manual", icon:"↗" };
  });
  const ids = new Set([...exercises.filter(item => !item.custom).map(item => item.id),...custom.map(item => item.id)]);
  if (new Set(custom.map(item => item.id)).size !== custom.length || !data.plan.every(id => ids.has(id)) || new Set(data.plan).size !== data.plan.length) fail();
  const preferences = { ...freshState().preferences };
  if (data.preferences) {
    if (!["light","dark"].includes(data.preferences.theme) || !number(data.preferences.waterGoal,100,10000) || !number(data.preferences.workoutGoal,1,300)) fail();
    Object.assign(preferences, { theme:data.preferences.theme, waterGoal:data.preferences.waterGoal, workoutGoal:data.preferences.workoutGoal });
  }
  const routineSettings = { ...freshState().routineSettings };
  if (data.routineSettings) {
    if (!number(data.routineSettings.work,10,600,true) || !number(data.routineSettings.rest,0,300,true) || !number(data.routineSettings.rounds,1,10,true)) fail();
    Object.assign(routineSettings,{ work:data.routineSettings.work, rest:data.routineSettings.rest, rounds:data.routineSettings.rounds });
  }
  const favorites = data.favorites || [];
  if (!Array.isArray(favorites) || favorites.length > 100 || !favorites.every(id => ids.has(id))) fail();
  const next = { ...freshState(today.settings), ...today, history, plan:[...data.plan], customExercises:custom, favorites:[...new Set(favorites)], preferences, routineSettings };
  if (next.date !== localDateKey()) {
    next.history.unshift(daySnapshot(next));
    return { ...carryPreferences(freshState(next.settings),next), plan:next.plan, history:next.history.filter(day => day.date >= historyCutoff()).sort((a,b) => b.date.localeCompare(a.date)).slice(0,30) };
  }
  next.history = next.history.filter(day => day.date >= historyCutoff()).sort((a,b) => b.date.localeCompare(a.date));
  return next;
}

byId("import-data").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 5000000) throw new Error("Choose a backup smaller than 5 MB.");
    const next = validateBackup(JSON.parse(await file.text()));
    if (tracking || workoutRunning || circuit || workoutDraftDirty || permissionPending) throw new Error("Finish or clear your current session before restoring a backup.");
    if (!confirm("Replace this browser's saved records, settings, and workout plan with this backup? Download your current records first if you want to keep them.")) { event.target.value = ""; return; }
    state = next;
    exercises.splice(8); exercises.push(...state.customExercises);
    selectedExercise = null; resetWorkoutDraft(); byId("workout-form").hidden = true;
    byId("selected-workout-name").textContent = "Choose your first exercise";
    byId("selected-workout-description").textContent = "Select an exercise to see its instructions and tracking options.";
    selectedMood = state.habits.mood; byId("mood-note").value = state.habits.note;
    for (const key of ["waterGoal","workoutGoal"]) byId("preferences-form").elements[key].value = state.preferences[key];
    for (const key of ["work","rest","rounds"]) byId(`circuit-${key}`).value = state.routineSettings[key];
    setTheme(state.preferences.theme); populateSettings(); saveState(); renderSports(); updateOutputs(); populateWellness();
    byId("import-message").textContent = "Backup restored successfully."; toast("Your records are restored.");
  } catch (error) { byId("import-message").textContent = error.message.includes("JSON") ? "This file is not a valid JSON backup. Nothing was changed." : error.message; }
  event.target.value = "";
});

function populateWellness() {
  const form = byId("wellness-form");
  for (const key of ["heartRate","bloodPressure","spo2","temperature","sleep"]) form.elements[key].value = String(state.wellness[key]).includes("—") ? "" : state.wellness[key];
}
// Partial check-ins are useful: a person may only have recorded sleep today.
byId("wellness-form").querySelectorAll("input").forEach(input => { input.required = false; });
populateWellness();

state.workouts.forEach(workout => { workout.id ||= uid(); });
state.customExercises.forEach(exercise => {
  if (exercise && typeof exercise.id === "string" && typeof exercise.name === "string" && Array.isArray(exercise.instructions) && !exercises.some(item => item.id === exercise.id)) exercises.push({ ...exercise, custom:true, motion:false });
});
window.addEventListener("move:saved", renderExperience);
window.addEventListener("move:updated", renderExperience);
window.addEventListener("move:sports", decoratePlan);
window.addEventListener("move:day-reset", () => {
  selectedMood = state.habits.mood; byId("mood-note").value = state.habits.note; populateWellness(); renderExperience();
});
renderSports(); renderExperience(); decorateWalkingRows(); restoreDraft();

let installPrompt = null;
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; byId("install-app").hidden = false; });
byId("install-app").addEventListener("click", async () => {
  if (!installPrompt) return;
  await installPrompt.prompt(); installPrompt = null; byId("install-app").hidden = true;
});
function updateConnection() { byId("connection-state").textContent = navigator.onLine ? "Local storage · no account or cloud sync" : "You're offline · saved pages and local records remain available"; }
window.addEventListener("online", updateConnection); window.addEventListener("offline", updateConnection); updateConnection();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => { byId("connection-state").textContent = "Local records available · offline page caching could not be enabled"; });
