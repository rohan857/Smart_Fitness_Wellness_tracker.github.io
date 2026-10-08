    const STORAGE_KEY = "arCubeMovementTrackerV2";

    const localDateKey = () => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    };

    const freshState = (settings = {}) => ({
      date: localDateKey(),
      steps: 0,
      activeSeconds: 0,
      sessions: [],
      workouts: [],
      plan: [],
      history: [],
      habits: { water: [], mood: "", note: "" },
      customExercises: [],
      favorites: [],
      preferences: { theme: "light", waterGoal: 2000, workoutGoal: 20 },
      routineSettings: { work: 30, rest: 15, rounds: 1 },
      wellness: { heartRate: "—", bloodPressure: "—/—", spo2: "—", temperature: "—", sleep: "—", updatedAt: null },
      settings: { weight: 70, stride: 75, stepGoal: 10000, sensitivity: 1.25, ...settings }
    });

    let storageRecovery = null;

    function usableSavedState(saved) {
      const object = value => value && typeof value === "object" && !Array.isArray(value);
      const number = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
      const text = value => typeof value === "string";
      const array = (value, check) => value === undefined || (Array.isArray(value) && value.every(check));
      const settings = value => value === undefined || (object(value) && Object.entries({ weight: [25,250], stride: [30,150], stepGoal: [100,100000], sensitivity: [1.05,1.5] }).every(([key,[min,max]]) => value[key] === undefined || (number(value[key]) && value[key] >= min && value[key] <= max)));
      const day = value => object(value) && /^\d{4}-\d{2}-\d{2}$/.test(value.date)
        && number(value.steps) && Number.isInteger(value.steps) && number(value.activeSeconds)
        && array(value.sessions, item => object(item) && number(item.steps) && number(item.activeSeconds) && text(item.time))
        && array(value.workouts, item => object(item) && text(item.name) && text(item.exerciseId) && number(item.reps) && Number.isInteger(item.reps) && number(item.sets) && item.sets >= 1 && number(item.minutes) && text(item.time))
        && settings(value.settings)
        && (value.wellness === undefined || (object(value.wellness) && Object.values(value.wellness).every(item => item === null || text(item))))
        && (value.habits === undefined || (object(value.habits) && Array.isArray(value.habits.water) && value.habits.water.every(number) && text(value.habits.mood) && text(value.habits.note)));
      return day(saved) && array(saved.history, day) && array(saved.plan, text) && array(saved.favorites, text)
        && array(saved.customExercises, item => object(item) && text(item.id) && text(item.name) && text(item.group) && text(item.description) && text(item.target) && Array.isArray(item.instructions) && item.instructions.every(text))
        && (saved.preferences === undefined || (object(saved.preferences) && ["light","dark"].includes(saved.preferences.theme) && number(saved.preferences.waterGoal) && saved.preferences.waterGoal > 0 && number(saved.preferences.workoutGoal) && saved.preferences.workoutGoal > 0))
        && (saved.routineSettings === undefined || (object(saved.routineSettings) && ["work","rest","rounds"].every(key => number(saved.routineSettings[key]))));
    }

    function normaliseSavedDay(day) {
      const base = freshState(day.settings);
      return { ...base, ...day, sessions: day.sessions || [], workouts: day.workouts || [], settings: { ...base.settings, ...day.settings }, wellness: { ...base.wellness, ...day.wellness }, habits: { ...base.habits, ...day.habits } };
    }

    function loadState() {
      let raw = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
        const saved = JSON.parse(raw);
        if (saved !== null && !usableSavedState(saved)) throw new Error("Unreadable saved records");
        if (saved?.date === localDateKey()) {
          const base = freshState(saved.settings);
          return {
            ...base,
            ...saved,
            settings: { ...base.settings, ...saved.settings },
            wellness: { ...base.wellness, ...saved.wellness },
            workouts: Array.isArray(saved.workouts) ? saved.workouts : [],
            plan: Array.isArray(saved.plan) ? saved.plan : [],
            history: Array.isArray(saved.history) ? saved.history.filter(day => day && day.date >= historyCutoff()).map(normaliseSavedDay).slice(0, 30) : [],
            habits: { ...base.habits, ...saved.habits },
            preferences: { ...base.preferences, ...saved.preferences },
            routineSettings: { ...base.routineSettings, ...saved.routineSettings },
            customExercises: Array.isArray(saved.customExercises) ? saved.customExercises : [],
            favorites: Array.isArray(saved.favorites) ? saved.favorites : []
          };
        }
        const next = freshState(saved?.settings);
        next.plan = Array.isArray(saved?.plan) ? saved.plan : [];
        next.history = Array.isArray(saved?.history) ? saved.history.map(normaliseSavedDay) : [];
        if (saved?.date) next.history = [daySnapshot(normaliseSavedDay(saved)), ...next.history].filter(day => day.date >= historyCutoff()).slice(0, 30);
        return carryPreferences(next, saved);
      } catch {
        if (raw) {
          storageRecovery = raw;
          try { localStorage.setItem(`${STORAGE_KEY}Recovery`, raw); } catch {}
        }
        return freshState();
      }
    }

    function carryPreferences(next, previous) {
      if (!previous) return next;
      for (const key of ["customExercises", "favorites", "preferences", "routineSettings"]) {
        if (previous[key] != null) next[key] = previous[key];
      }
      return next;
    }

    let state = loadState();
    let tracking = false;
    let gravity = 9.81;
    let peakActive = false;
    let lastStepAt = 0;
    let lastMovementAt = 0;
    let motionEventCount = 0;
    let currentSession = null;
    let activeTimer = null;
    let saveTimer = null;
    let permissionPending = false;
    let permissionVersion = 0;

    function saveState() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        document.getElementById("storage-warning").hidden = true;
      } catch {
        document.getElementById("storage-warning").hidden = false;
      }
      window.dispatchEvent(new Event("move:saved"));
    }
    function historyCutoff() {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }
    function daySnapshot(day) {
      return { date: day.date, steps: day.steps, activeSeconds: day.activeSeconds, sessions: day.sessions || [], workouts: day.workouts || [], wellness: day.wellness, settings: day.settings, habits: day.habits || { water: [], mood: "", note: "" } };
    }
    const distanceKm = () => state.steps * Number(state.settings.stride) / 100000;
    const calories = () => distanceKm() * Number(state.settings.weight) * 0.5;
    const activeMinutes = () => state.activeSeconds / 60;
    const stepPercent = () => Math.min(100, state.steps / Number(state.settings.stepGoal) * 100);
    const formatNumber = value => Number(value).toLocaleString();

    function updateOutputs() {
      const outputs = {
        steps: formatNumber(state.steps),
        distance: distanceKm().toFixed(2),
        calories: calories().toFixed(1),
        activeMinutes: activeMinutes().toFixed(1),
        stepPercent: `${Math.round(stepPercent())}% complete`,
        stepPercentShort: `${Math.round(stepPercent())}%`,
        stepGoal: `Goal ${formatNumber(state.settings.stepGoal)}`,
        stepGoalValue: formatNumber(state.settings.stepGoal),
        sessionCount: state.sessions.length
      };
      Object.entries(outputs).forEach(([key, value]) => {
        document.querySelectorAll(`[data-output="${key}"]`).forEach(node => node.textContent = value);
      });

      document.querySelector("[data-progress='steps']").style.width = `${stepPercent()}%`;
      document.getElementById("summary-ring").style.setProperty("--progress", `${stepPercent() * 3.6}deg`);
      document.getElementById("summary-heading").textContent = state.steps >= state.settings.stepGoal ? "Daily step goal reached" : state.steps ? "Keep going — you are making progress" : "Start moving toward your goal";

      const list = document.getElementById("session-list");
      list.innerHTML = "";
      state.sessions.forEach(session => {
        const item = document.createElement("li");
        const title = document.createElement("strong");
        const details = document.createElement("span");
        title.textContent = `${formatNumber(session.steps)} estimated steps`;
        details.textContent = `${session.time} · ${(session.activeSeconds / 60).toFixed(1)} active min · ${session.source === "manual" ? "Manual entry" : "Motion estimate"}`;
        item.append(title, details);
        list.appendChild(item);
      });
      document.getElementById("empty-sessions").hidden = state.sessions.length > 0;
      if (typeof decorateWalkingRows === "function") decorateWalkingRows();

      Object.entries(state.wellness).forEach(([key, value]) => {
        document.querySelectorAll(`[data-wellness="${key}"]`).forEach(node => node.textContent = value);
      });
      document.getElementById("wellness-updated").textContent = state.wellness.updatedAt ? `Updated ${state.wellness.updatedAt}` : "Not checked today";

      renderWorkoutTotals();
      window.dispatchEvent(new Event("move:updated"));
    }

    function populateSettings() {
      const form = document.getElementById("settings-form");
      Object.entries(state.settings).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; });
    }

    function queueSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveState, 600);
    }

    function registerStep() {
      state.steps += 1;
      currentSession.steps += 1;
      lastMovementAt = Date.now();
      updateOutputs();
      queueSave();
    }

    function handleMotion(event) {
      const direct = event.acceleration;
      let motion = 0;
      const valid = value => value && [value.x, value.y, value.z].every(axis => typeof axis === "number" && Number.isFinite(axis));

      if (valid(direct)) {
        motion = Math.hypot(direct.x, direct.y, direct.z);
      } else {
        const acceleration = event.accelerationIncludingGravity;
        if (!valid(acceleration)) return;
        const magnitude = Math.hypot(acceleration.x, acceleration.y, acceleration.z);
        gravity = gravity * 0.9 + magnitude * 0.1;
        motion = Math.abs(magnitude - gravity);
      }
      motionEventCount += 1;

      const threshold = Number(state.settings.sensitivity);
      const now = performance.now();
      document.getElementById("signal-value").textContent = motion.toFixed(2);
      document.getElementById("motion-signal").style.width = `${Math.min(100, motion / 4 * 100)}%`;

      if (motion > threshold && !peakActive && now - lastStepAt > 300) {
        lastStepAt = now;
        registerStep();
      }
      peakActive = motion > threshold * 0.55;
    }

    async function startTracking() {
      ensureCurrentDay();
      if (tracking || permissionPending) return;
      if (workoutRunning || (typeof circuit !== "undefined" && circuit)) {
        showTrackerMessage("Pause your Sports workout before starting the walking tracker.", true);
        return;
      }
      if (!("DeviceMotionEvent" in window)) {
        showTrackerMessage("This device or browser does not provide motion sensor data.", true);
        return;
      }
      if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
        showTrackerMessage("Motion tracking requires HTTPS. Open the deployed GitHub Pages address.", true);
        return;
      }

      permissionPending = true;
      const requestVersion = ++permissionVersion;
      try {
        if (typeof DeviceMotionEvent.requestPermission === "function") {
          const permission = await DeviceMotionEvent.requestPermission();
          if (permission !== "granted") {
            showTrackerMessage("Motion permission was not granted. Allow it in browser settings and try again.", true);
            return;
          }
        }

        if (requestVersion !== permissionVersion || document.hidden) return;
        tracking = true;
        peakActive = false;
        lastStepAt = performance.now();
        lastMovementAt = 0;
        gravity = 9.81;
        motionEventCount = 0;
        currentSession = { steps: 0, activeSeconds: 0, startedAt: Date.now() };
        window.addEventListener("devicemotion", handleMotion);
        document.getElementById("start-tracking").disabled = true;
        document.getElementById("stop-tracking").disabled = false;
        document.getElementById("tracker-state").classList.add("is-running");
        document.getElementById("tracker-state").lastChild.textContent = "Running";
        document.getElementById("day-status").lastElementChild.textContent = "Tracking movement";
        document.querySelector(".plain-counter").classList.add("is-running");
        showTrackerMessage("Tracking is active. Walk naturally with your phone in a pocket or hand.");

        activeTimer = setInterval(() => {
          if (tracking && Date.now() - lastMovementAt < 3000) {
            state.activeSeconds += 1;
            currentSession.activeSeconds += 1;
            updateOutputs();
            queueSave();
          }
        }, 1000);

        setTimeout(() => {
          if (tracking && motionEventCount === 0) showTrackerMessage("No sensor data received. Check motion permission or try another mobile browser.", true);
        }, 3500);
      } catch {
        showTrackerMessage("Motion access could not be started. Check the browser permission and try again.", true);
      } finally {
        if (requestVersion === permissionVersion) permissionPending = false;
      }
    }

    function stopTracking(pageHidden = false) {
      if (!tracking) return;
      tracking = false;
      window.removeEventListener("devicemotion", handleMotion);
      clearInterval(activeTimer);
      if (currentSession && (currentSession.steps > 0 || currentSession.activeSeconds > 0)) {
        state.sessions.unshift({
          steps: currentSession.steps,
          activeSeconds: currentSession.activeSeconds,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        });
      }
      currentSession = null;
      saveState();
      updateOutputs();
      document.getElementById("start-tracking").disabled = false;
      document.getElementById("stop-tracking").disabled = true;
      document.getElementById("tracker-state").classList.remove("is-running");
      document.getElementById("tracker-state").lastChild.textContent = "Stopped";
      document.getElementById("day-status").lastElementChild.textContent = "Ready to move";
      document.querySelector(".plain-counter").classList.remove("is-running");
      document.getElementById("motion-signal").style.width = "0%";
      showTrackerMessage(pageHidden ? "Tracking stopped because the page was hidden." : "Session saved in today's summary.");
    }

    function showTrackerMessage(message, isError = false) {
      const node = document.getElementById("tracker-message");
      node.textContent = message;
      node.classList.toggle("is-error", isError);
    }

    function openTab(tabName) {
      document.querySelectorAll(".tab").forEach(tab => {
        const active = tab.dataset.tab === tabName;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      document.querySelectorAll(".view").forEach(view => {
        const active = view.id === tabName;
        view.classList.toggle("is-active", active);
        view.hidden = !active;
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => openTab(tab.dataset.tab)));
    document.querySelectorAll("[data-open-tracker]").forEach(button => button.addEventListener("click", () => openTab("tracker")));
    document.querySelectorAll("[data-open-wellness]").forEach(button => button.addEventListener("click", () => openTab("wellness")));
    document.getElementById("start-tracking").addEventListener("click", startTracking);
    document.getElementById("stop-tracking").addEventListener("click", () => stopTracking());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        permissionVersion += 1;
        permissionPending = false;
        stopTracking(true);
        pauseWorkout("Workout paused because the page was hidden. Resume when you are ready.");
        saveState();
      } else ensureCurrentDay();
    });

    document.getElementById("settings-form").addEventListener("submit", event => {
      event.preventDefault();
      ensureCurrentDay();
      const data = new FormData(event.currentTarget);
      state.settings = {
        weight: Number(data.get("weight")), stride: Number(data.get("stride")),
        stepGoal: Number(data.get("stepGoal")), sensitivity: Number(data.get("sensitivity"))
      };
      saveState();
      updateOutputs();
      showTrackerMessage("Settings saved. Calorie and distance estimates were recalculated.");
    });

    document.getElementById("wellness-form").addEventListener("submit", event => {
      event.preventDefault();
      ensureCurrentDay();
      const data = new FormData(event.currentTarget);
      state.wellness = {
        heartRate: String(data.get("heartRate") || "—"),
        bloodPressure: String(data.get("bloodPressure") || "—/—").trim(),
        spo2: String(data.get("spo2") || "—"),
        temperature: String(data.get("temperature") || "—"),
        sleep: String(data.get("sleep") || "—"),
        updatedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };
      saveState();
      updateOutputs();
      document.getElementById("wellness-message").textContent = "Wellness readings saved for today.";
    });

    document.getElementById("reset-day").addEventListener("click", () => {
      if (typeof circuit !== "undefined" && circuit) { toast("Finish your guided session before resetting today."); return; }
      if (!confirm("Reset today's steps, active time, sessions, completed workouts, wellness readings, water, and mood? Your workout plan and previous days will be kept.")) return;
      permissionVersion += 1;
      permissionPending = false;
      stopTracking();
      pauseWorkout();
      resetWorkoutDraft();
      updateWorkoutMethod();
      const previous = state;
      const { history, plan } = previous;
      state = carryPreferences(freshState(state.settings), previous);
      state.history = history;
      state.plan = plan;
      saveState();
      updateOutputs();
      renderSports();
      document.getElementById("day-status").lastElementChild.textContent = "Ready to move";
      window.dispatchEvent(new Event("move:day-reset"));
    });

    function updateDateLabel() {
      const today = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
      document.getElementById("date-line").textContent = `${today} · Estimates from this phone's movement.`;
    }

    function ensureCurrentDay() {
      if (state.date !== localDateKey()) {
        if (typeof endCircuitForNewDay === "function") endCircuitForNewDay();
        permissionVersion += 1;
        permissionPending = false;
        stopTracking();
        pauseWorkout();
        resetWorkoutDraft();
        updateWorkoutMethod();
        const history = [daySnapshot(state), ...state.history].filter(day => day.date >= historyCutoff()).slice(0, 30);
        const plan = state.plan;
        state = carryPreferences(freshState(state.settings), state);
        state.history = history;
        state.plan = plan;
        saveState();
        updateOutputs();
        updateDateLabel();
        renderSports();
        window.dispatchEvent(new Event("move:day-reset"));
      }
    }
    setInterval(ensureCurrentDay, 1000);

    const exercises = [
      { id: "arm-curls", name: "Standing arm curls", group: "strength", motion: true, icon: "↗", target: "Reps · standing", description: "A simple bend-and-extend arm movement without weights.", instructions: ["Stand comfortably with your elbow near your side.", "Bend your elbow, bringing your hand toward your shoulder, then lower it slowly.", "For motion mode, hold the phone securely in the moving hand. Count each arm separately."] },
      { id: "arm-raises", name: "Gentle front raises", group: "mobility", motion: true, icon: "↑", target: "Reps · standing", description: "Controlled forward arm raises through a comfortable range.", instructions: ["Stand upright with your arms relaxed.", "Lift one arm forward to a comfortable height, then lower it.", "Use slow movements and a secure phone grip for motion counting; enter the other arm separately."] },
      { id: "march", name: "March in place", group: "cardio", motion: false, icon: "↔", target: "Timer · no equipment", description: "Bring a little movement into a small space.", instructions: ["Clear a small area and stand comfortably.", "Alternate lifting and lowering each foot at your own pace.", "Use the timer and enter your total steps as reps if you count them yourself."] },
      { id: "chair-squats", name: "Chair sit-to-stands", group: "strength", motion: false, icon: "↓", target: "Reps · sturdy chair", description: "Use a stable chair for a controlled sit-and-stand movement.", instructions: ["Place a sturdy chair against a wall so it cannot slide.", "Stand up from the chair, then sit back down with control.", "Keep your hands free. Leave the phone nearby and log the reps manually."] },
      { id: "wall-pushups", name: "Wall push-ups", group: "strength", motion: false, icon: "→", target: "Reps · wall", description: "A standing push-up using a clear wall.", instructions: ["Place both palms on a stable wall at a comfortable height.", "Bend your elbows to move toward the wall, then push away gently.", "Place the phone aside and use the timer or manual entry."] },
      { id: "calf-raises", name: "Calf raises", group: "strength", motion: false, icon: "⇡", target: "Reps · standing", description: "Lift and lower your heels with a steady rhythm.", instructions: ["Stand near a stable support you can hold for balance.", "Lift your heels gently and lower them with control.", "Keep the phone aside, count your reps, and record them below."] },
      { id: "shoulder-rolls", name: "Shoulder rolls", group: "mobility", motion: false, icon: "↻", target: "Timer · seated or standing", description: "Gentle shoulder circles for a movement break.", instructions: ["Sit or stand comfortably and relax your arms.", "Circle your shoulders slowly through a comfortable range.", "Use the timer with your phone nearby; enter reps only if you count them."] },
      { id: "floor-stretch", name: "Seated stretch break", group: "mobility", motion: false, icon: "⌁", target: "Timer · comfortable seat", description: "A quiet timed break for gentle seated movement.", instructions: ["Sit on a stable chair with your feet supported.", "Gently reach and stretch through a comfortable range without forcing it.", "Keep your phone aside. Log time only by leaving reps at zero."] }
    ];
    state.customExercises.forEach(exercise => {
      if (exercise && typeof exercise.id === "string" && typeof exercise.name === "string" && Array.isArray(exercise.instructions) && !exercises.some(item => item.id === exercise.id)) exercises.push({ ...exercise, custom: true, motion: false });
    });
    let selectedExercise = null;
    let workoutRunning = false;
    let workoutStartedAt = 0;
    let workoutElapsedMs = 0;
    let workoutMovements = 0;
    let workoutPeak = false;
    let workoutLastPeak = 0;
    let workoutGravity = 9.81;
    let workoutSensorEvents = 0;
    let workoutTimer = null;
    let workoutSensorTimeout = null;
    let workoutSource = "manual";
    let workoutDraftDirty = false;
    const byId = id => document.getElementById(id);
    const workoutMessage = (message, error = false) => {
      byId("workout-message").textContent = message;
      byId("workout-message").classList.toggle("is-error", error);
    };

    function renderLibrary() {
      const filter = byId("workout-filter").value;
      const query = byId("exercise-search").value.trim().toLowerCase();
      const grid = byId("exercise-grid");
      grid.replaceChildren();
      const matches = exercises.filter(exercise => (filter === "all" || (filter === "favorites" ? state.favorites.includes(exercise.id) : filter === "custom" ? exercise.custom : filter === "motion" ? exercise.motion : exercise.group === filter)) && `${exercise.name} ${exercise.description} ${exercise.group}`.toLowerCase().includes(query));
      byId("library-empty").hidden = matches.length > 0;
      matches.forEach(exercise => {
        const card = document.createElement("article");
        card.className = `exercise-card${selectedExercise?.id === exercise.id ? " is-selected" : ""}`;
        const safe = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
        card.innerHTML = `<div class="exercise-top"><span class="exercise-category">${safe(exercise.group)}</span><button class="favorite-button" type="button" aria-label="Favorite ${safe(exercise.name)}" aria-pressed="${state.favorites.includes(exercise.id)}">${state.favorites.includes(exercise.id) ? "★" : "☆"}</button></div><div class="exercise-illustration" aria-hidden="true">${typeof exerciseIllustration === "function" ? exerciseIllustration(exercise.id) : safe(exercise.icon)}</div><div class="exercise-title-line"><h4>${safe(exercise.name)}</h4><span class="exercise-badge${exercise.motion ? " motion-badge" : ""}">${exercise.motion ? "Hand motion" : "Timer"}</span></div><p>${safe(exercise.description)}</p><span class="exercise-target">${safe(exercise.target)}</span><div class="exercise-actions"><button class="choose-exercise" type="button">${selectedExercise?.id === exercise.id ? "Selected" : "Choose workout"}</button><button class="add-exercise" type="button" aria-label="Add ${safe(exercise.name)} to plan">${state.plan.includes(exercise.id) ? "Added ✓" : "+ Plan"}</button></div>`;
        card.querySelector(".favorite-button").addEventListener("click", () => {
          state.favorites = state.favorites.includes(exercise.id) ? state.favorites.filter(id => id !== exercise.id) : [...state.favorites, exercise.id];
          saveState(); renderLibrary();
        });
        if (exercise.custom && typeof addCustomExerciseControls === "function") addCustomExerciseControls(card, exercise);
        card.querySelector(".choose-exercise").addEventListener("click", () => chooseExercise(exercise.id));
        const add = card.querySelector(".add-exercise");
        add.disabled = state.plan.includes(exercise.id);
        add.addEventListener("click", () => {
          if (!state.plan.includes(exercise.id)) state.plan.push(exercise.id);
          saveState();
          renderSports();
        });
        grid.append(card);
      });
    }

    function renderSports() {
      state.plan = state.plan.filter(id => exercises.some(exercise => exercise.id === id));
      renderLibrary();
      const list = byId("workout-plan");
      list.replaceChildren();
      state.plan.forEach(id => {
        const exercise = exercises.find(item => item.id === id);
        const row = document.createElement("li");
        const choose = document.createElement("button");
        choose.type = "button";
        choose.className = "plan-choose";
        choose.textContent = exercise.name;
        choose.addEventListener("click", () => chooseExercise(id));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "text-button";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", `Remove ${exercise.name} from plan`);
        remove.addEventListener("click", () => {
          state.plan = state.plan.filter(item => item !== id);
          saveState();
          renderSports();
        });
        row.append(choose, remove);
        list.append(row);
      });
      byId("plan-count").textContent = state.plan.length;
      byId("plan-empty").hidden = state.plan.length > 0;
      renderWorkoutTotals();
      window.dispatchEvent(new Event("move:sports"));
    }

    function addHistoryRow(list, titleText, detailText, note) {
      const row = document.createElement("li");
      const title = document.createElement("strong");
      title.textContent = titleText;
      const details = document.createElement("span");
      details.textContent = detailText;
      row.append(title, details);
      if (note) {
        const noteNode = document.createElement("small");
        noteNode.textContent = note;
        row.append(noteNode);
      }
      list.append(row);
    }

    function renderWorkoutTotals() {
      const minutes = state.workouts.reduce((total, item) => total + item.minutes, 0);
      const reps = state.workouts.reduce((total, item) => total + item.reps, 0);
      byId("workout-count").textContent = state.workouts.length;
      byId("workout-minutes").textContent = minutes.toFixed(1);
      byId("workout-reps").textContent = formatNumber(reps);
      byId("today-workout-summary").textContent = `${state.workouts.length} workouts · ${minutes.toFixed(1)} min`;
      const list = byId("completed-workouts");
      list.replaceChildren();
      state.workouts.forEach(item => addHistoryRow(list, item.name, `${item.reps} total reps · ${item.sets} sets · ${item.minutes.toFixed(1)} min · ${item.source === "motion" ? "Motion estimate, reviewed" : item.source === "timer" ? "Timer + manual reps" : item.source === "circuit" ? "Guided intervals" : "Manual entry"} · ${item.time}`, item.note));
      byId("workouts-empty").hidden = state.workouts.length > 0;
      const historyList = byId("daily-history");
      historyList.replaceChildren();
      state.history.forEach(day => addHistoryRow(historyList, day.date, `${formatNumber(day.steps)} steps · ${(day.activeSeconds / 60).toFixed(1)} active min · ${(day.workouts || []).length} workouts`));
      byId("history-empty").hidden = state.history.length > 0;
      if (typeof decorateWorkoutRows === "function") decorateWorkoutRows();
    }

    function chooseExercise(id) {
      if (typeof circuit !== "undefined" && circuit) { toast("Finish your guided session before starting an individual exercise."); return; }
      if (permissionPending) {
        workoutMessage("Finish the motion permission request before choosing another exercise.", true);
        return;
      }
      if (workoutDraftDirty && !confirm("Discard this unsaved workout and choose another exercise?")) return;
      pauseWorkout();
      selectedExercise = exercises.find(exercise => exercise.id === id);
      resetWorkoutDraft();
      byId("selected-workout-name").textContent = selectedExercise.name;
      byId("selected-workout-description").textContent = selectedExercise.description;
      byId("workout-form").hidden = false;
      byId("workout-instructions").replaceChildren(...selectedExercise.instructions.map(instruction => {
        const item = document.createElement("li");
        item.textContent = instruction;
        return item;
      }));
      byId("workout-method").querySelector('[value="motion"]').disabled = !selectedExercise.motion;
      byId("workout-method").value = selectedExercise.motion ? "motion" : "timer";
      updateWorkoutMethod();
      renderLibrary();
      if (typeof showExerciseDemo === "function") showExerciseDemo(id);
      byId("workout-console").scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function updateWorkoutMethod() {
      pauseWorkout();
      const method = byId("workout-method").value;
      byId("workout-method-note").textContent = method === "motion"
        ? "Experimental: each movement peak may count as a rep. Move gently, keep your phone secure, and correct the total before saving. Requires a supported phone browser with motion access."
        : method === "timer" ? "Keep the phone nearby. Start the timer, then enter your total reps across all sets before saving."
        : "Already finished? Enter total reps, sets, and minutes below. No sensor permission needed.";
      byId("workout-start").disabled = method === "manual";
      // Preserve the source of an existing draft when switching to manual corrections.
      if (workoutElapsedMs === 0) workoutSource = method;
    }

    function elapsedWorkoutMs() {
      return workoutElapsedMs + (workoutRunning ? Date.now() - workoutStartedAt : 0);
    }

    function refreshWorkoutClock() {
      const seconds = Math.floor(elapsedWorkoutMs() / 1000);
      byId("workout-clock").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
      byId("workout-minute-input").value = (elapsedWorkoutMs() / 60000).toFixed(1);
    }

    async function startWorkout() {
      ensureCurrentDay();
      if (!selectedExercise || workoutRunning || permissionPending) return;
      if (tracking || (typeof circuit !== "undefined" && circuit)) {
        workoutMessage("Stop the walking tracker before starting a Sports workout.", true);
        return;
      }
      const method = byId("workout-method").value;
      if (method === "manual") return;
      permissionPending = true;
      const requestVersion = ++permissionVersion;
      byId("workout-start").disabled = true;
      byId("workout-method").disabled = true;
      try {
        if (method === "motion") {
          if (!selectedExercise.motion) throw new Error("Use timer or manual entry for this exercise.");
          if (!window.isSecureContext || !("DeviceMotionEvent" in window)) throw new Error("Motion access is unavailable here. Use timer or manual entry, or open this app on a supported phone over HTTPS.");
          if (typeof DeviceMotionEvent.requestPermission === "function") {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission !== "granted") throw new Error("Motion permission was denied. You can still use timer or manual entry.");
          }
        }
        if (requestVersion !== permissionVersion || document.hidden) return;
        workoutRunning = true;
        workoutDraftDirty = true;
        workoutSource = method;
        workoutStartedAt = Date.now();
        workoutPeak = false;
        workoutLastPeak = performance.now();
        workoutGravity = 9.81;
        workoutSensorEvents = 0;
        if (method === "motion") {
          window.addEventListener("devicemotion", handleWorkoutMotion);
          workoutSensorTimeout = setTimeout(() => {
            if (workoutRunning && workoutSensorEvents === 0) {
              pauseWorkout("No usable motion data arrived. Switch to timer or manual entry.");
            }
          }, 4000);
        }
        workoutTimer = setInterval(refreshWorkoutClock, 250);
        byId("workout-pause").disabled = false;
        byId("workout-method").disabled = true;
        byId("workout-minute-input").disabled = true;
        byId("workout-rep-input").disabled = method === "motion";
        byId("workout-console").classList.add("is-running");
        workoutMessage(method === "motion" ? "Counting movement peaks. Pause to correct reps, or save when finished." : "Timer running. Enter the reps you complete, then save your workout.");
      } catch (error) {
        workoutMessage(error.message || "Could not start the workout. Try manual entry.", true);
      } finally {
        if (requestVersion === permissionVersion) permissionPending = false;
        byId("workout-start").disabled = workoutRunning || byId("workout-method").value === "manual";
        byId("workout-method").disabled = workoutRunning;
      }
    }

    function handleWorkoutMotion(event) {
      if (!workoutRunning) return;
      let motion;
      const direct = event.acceleration;
      const valid = value => value && [value.x, value.y, value.z].every(axis => typeof axis === "number" && Number.isFinite(axis));
      if (valid(direct)) motion = Math.hypot(direct.x, direct.y, direct.z);
      else if (valid(event.accelerationIncludingGravity)) {
        const value = event.accelerationIncludingGravity;
        const magnitude = Math.hypot(value.x, value.y, value.z);
        workoutGravity = workoutGravity * 0.9 + magnitude * 0.1;
        motion = Math.abs(magnitude - workoutGravity);
      } else return;
      workoutSensorEvents += 1;
      byId("workout-signal-value").textContent = motion.toFixed(2);
      byId("workout-signal").style.width = `${Math.min(100, motion / 4 * 100)}%`;
      const now = performance.now();
      const threshold = Number(state.settings.sensitivity);
      if (motion > threshold && !workoutPeak && now - workoutLastPeak >= 650) {
        workoutLastPeak = now;
        workoutMovements += 1;
        byId("workout-live-reps").textContent = workoutMovements;
        byId("workout-rep-input").value = workoutMovements;
      }
      workoutPeak = motion > threshold * 0.45;
    }

    function pauseWorkout(message = "Workout paused. Review the values, resume, or save your completed workout.") {
      if (!workoutRunning) return;
      workoutElapsedMs = elapsedWorkoutMs();
      workoutRunning = false;
      clearInterval(workoutTimer);
      clearTimeout(workoutSensorTimeout);
      window.removeEventListener("devicemotion", handleWorkoutMotion);
      refreshWorkoutClock();
      byId("workout-start").disabled = byId("workout-method").value === "manual";
      byId("workout-start").textContent = "Resume workout";
      byId("workout-pause").disabled = true;
      byId("workout-method").disabled = false;
      byId("workout-minute-input").disabled = false;
      byId("workout-rep-input").disabled = false;
      byId("workout-console").classList.remove("is-running");
      byId("workout-signal").style.width = "0%";
      workoutMessage(message);
    }

    function resetWorkoutDraft() {
      pauseWorkout();
      workoutElapsedMs = 0;
      workoutMovements = 0;
      workoutDraftDirty = false;
      workoutSource = byId("workout-method").value;
      byId("workout-form").reset();
      byId("workout-method").disabled = false;
      byId("workout-minute-input").disabled = false;
      byId("workout-rep-input").disabled = false;
      byId("workout-clock").textContent = "00:00";
      byId("workout-live-reps").textContent = "0";
      byId("workout-signal-value").textContent = "0.00";
      byId("workout-start").textContent = "Start workout";
      byId("workout-start").disabled = false;
      workoutMessage("Ready when you are. Your draft is saved on this browser as you go.");
      byId("draft-restored").hidden = true;
      window.dispatchEvent(new Event("move:draft-cleared"));
    }

    byId("workout-filter").addEventListener("change", renderLibrary);
    byId("workout-start").addEventListener("click", startWorkout);
    byId("workout-pause").addEventListener("click", () => pauseWorkout());
    byId("workout-method").addEventListener("change", updateWorkoutMethod);
    byId("workout-form").addEventListener("input", () => { workoutDraftDirty = true; });
    byId("workout-rep-input").addEventListener("change", () => {
      workoutMovements = Number(byId("workout-rep-input").value) || 0;
      byId("workout-live-reps").textContent = workoutMovements;
    });
    byId("workout-discard").addEventListener("click", () => {
      if (workoutDraftDirty && !confirm("Clear this unsaved workout?")) return;
      permissionVersion += 1;
      permissionPending = false;
      resetWorkoutDraft();
      updateWorkoutMethod();
    });
    byId("workout-form").addEventListener("submit", event => {
      event.preventDefault();
      if (permissionPending) { workoutMessage("Wait for the motion permission request to finish.", true); return; }
      const previousDate = state.date;
      ensureCurrentDay();
      if (previousDate !== state.date) { workoutMessage("A new day has started. Enter your new workout details before saving.", true); return; }
      pauseWorkout();
      const reps = Number(byId("workout-rep-input").value);
      const sets = Number(byId("workout-set-input").value);
      const minutes = Number(byId("workout-minute-input").value);
      if (!selectedExercise || !byId("workout-form").reportValidity()) return;
      if (![reps, sets, minutes].every(Number.isFinite) || (!reps && !minutes)) { workoutMessage("Enter at least one rep or some workout time before saving.", true); return; }
      state.workouts.unshift({ id: crypto.randomUUID(), exerciseId: selectedExercise.id, name: selectedExercise.name, reps, sets, minutes, source: workoutSource, note: byId("workout-note").value.trim(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
      saveState();
      resetWorkoutDraft();
      updateWorkoutMethod();
      renderSports();
      workoutMessage("Workout saved. Nice work — your log is updated below.");
    });
    byId("export-data").addEventListener("click", () => {
      ensureCurrentDay();
      const blob = new Blob([JSON.stringify({ app: "AR Move", version: 3, exportedAt: new Date().toISOString(), today: daySnapshot(state), history: state.history, plan: state.plan, customExercises: state.customExercises, favorites: state.favorites, preferences: state.preferences, routineSettings: state.routineSettings }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ar-move-${state.date}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    document.querySelectorAll("[data-tab-link]").forEach(button => button.addEventListener("click", () => openTab(button.dataset.tabLink)));
    document.querySelectorAll(".tab").forEach((tab, index, tabs) => {
      tab.addEventListener("keydown", event => {
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        if (next !== undefined) { event.preventDefault(); tabs[next].focus(); openTab(tabs[next].dataset.tab); }
      });
    });
    window.addEventListener("pagehide", () => { stopTracking(true); pauseWorkout(); saveState(); });
    window.addEventListener("beforeunload", event => {
      if (workoutDraftDirty) { event.preventDefault(); event.returnValue = ""; }
    });
    populateSettings();
    updateDateLabel();
    renderSports();
    updateOutputs();
    saveState();
    const requestedTab = new URLSearchParams(location.search).get("tab");
    openTab(["activity", "tracker", "sports", "wellness", "today"].includes(requestedTab) ? requestedTab : "activity");
    const dismissSplash = () => setTimeout(() => byId("splash").classList.add("is-hidden"), 700);
    if (document.readyState === "complete") dismissSplash();
    else window.addEventListener("load", dismissSplash);
