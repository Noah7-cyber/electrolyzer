// Elements
const elSystemStatusBadge = document.getElementById('system-status-badge');
const elSystemStatusIndicator = document.getElementById('system-status-indicator');
const elSystemStatusText = document.getElementById('system-status-text');
const elUptimeDisplay = document.getElementById('uptime-display');
const elSystemOfflineWarning = document.getElementById('system-offline-warning');

const btnModeLive = document.getElementById('btn-mode-live');
const btnModeSim = document.getElementById('btn-mode-sim');
const livePowerCards = document.getElementById('live-power-cards');
const simParamsCard = document.getElementById('simulation-parameters-card');

const simElectrolyte = document.getElementById('sim-electrolyte');
const simMaterial = document.getElementById('sim-material');
const simDistance = document.getElementById('sim-distance');
const simDistanceDisplay = document.getElementById('sim-distance-display');

const elValH2 = document.getElementById('val-h2');
const elValWater = document.getElementById('val-water');
const elValWaterCm = document.getElementById('val-water-cm');
const elValAmps = document.getElementById('val-amps');
const elValEfficiency = document.getElementById('val-efficiency');
const elSystemMessages = document.getElementById('system-messages');
const elDryTankWarning = document.getElementById('dry-tank-warning');

const elPwmSlider = document.getElementById('pwm-slider');
const elPwmDisplay = document.getElementById('pwm-display');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');

const canvas = document.getElementById('tank-canvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvas-container');

// State
let isRunning = false;
let isSimulationMode = false;
let currentPwm = 0;
let uptimeSeconds = 0;
let uptimeInterval = null;

let telemetry = {
    h2Ppm: 0,
    waterLevelCm: 20, // Max safe is 20, Low is < 8
    totalH2mL: 0 // Track total H2 produced
};

// Electrical state
let assumedAmps = 0;
let systemEfficiency = 0;
let h2PpmHistory10s = []; // Array of {time, ppm}

// Simulation State
let bakingSodaRunTime = 0; // seconds

// History for Chart
const maxHistoryPoints = 60;
let h2History = Array.from({ length: maxHistoryPoints }, () => 0);

// --- HTTP Polling for Live Telemetry ---
let pollingInterval = null;

function fetchLiveTelemetry() {
    if (isSimulationMode) return;

    fetch('/api/telemetry')
        .then(res => res.json())
        .then(data => {
            if (!isSimulationMode && data.h2 !== undefined) {
                telemetry.h2Ppm = parseFloat(data.h2);
            }
        })
        .catch(err => {
            // Silently fail or log, don't spam UI
        });
}

// Start polling
pollingInterval = setInterval(fetchLiveTelemetry, 1000);

// --- Utilities ---
function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function addSystemMessage(msg) {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    elSystemMessages.innerHTML += `[${time}] ${msg}<br/>`;
    elSystemMessages.scrollTop = elSystemMessages.scrollHeight;
}

function triggerGlow(element) {
    // Re-trigger animation
    element.classList.remove('value-flash');
    void element.offsetWidth; // trigger reflow
    element.classList.add('value-flash');
}

// --- Chart.js Setup ---
const ctxChart = document.getElementById('h2-chart').getContext('2d');
Chart.defaults.color = '#707070';
Chart.defaults.font.family = 'monospace';

const gradientFill = ctxChart.createLinearGradient(0, 0, 0, 150);
gradientFill.addColorStop(0, 'rgba(0, 242, 255, 0.3)');
gradientFill.addColorStop(1, 'rgba(0, 242, 255, 0.0)');

const h2Chart = new Chart(ctxChart, {
    type: 'line',
    data: {
        labels: Array.from({ length: maxHistoryPoints }, (_, i) => i),
        datasets: [{
            label: 'H2 PPM',
            data: h2History,
            borderColor: '#00f2ff',
            borderWidth: 1.5,
            backgroundColor: gradientFill,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointBackgroundColor: '#00f2ff'
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 0 // Disable animation for performance
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#121212',
                titleColor: '#00f2ff',
                bodyColor: '#00f2ff',
                borderColor: '#2a2a2a',
                borderWidth: 1,
                callbacks: {
                    title: () => null,
                    label: (context) => `H2: ${context.parsed.y.toFixed(1)} PPM`
                }
            }
        },
        scales: {
            x: {
                display: false,
            },
            y: {
                min: 0,
                max: 160,
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)',
                    drawBorder: false,
                },
                ticks: {
                    font: { size: 10 }
                }
            }
        }
    }
});

// --- UI Updates ---
function updateUI() {
    // System Status
    if (isRunning) {
        elSystemStatusBadge.classList.remove('text-theme-cyan', 'border-theme-cyan');
        elSystemStatusBadge.classList.add('text-theme-red', 'border-theme-red');
        elSystemStatusIndicator.classList.remove('bg-theme-text-dim');
        elSystemStatusIndicator.classList.add('bg-theme-red', 'animate-pulse-glow');
        elSystemStatusText.innerText = 'System Armed';
        elSystemOfflineWarning.style.display = 'none';
        if (isSimulationMode) elPwmSlider.disabled = false;
    } else {
        elSystemStatusBadge.classList.add('text-theme-cyan', 'border-theme-cyan');
        elSystemStatusBadge.classList.remove('text-theme-red', 'border-theme-red');
        elSystemStatusIndicator.classList.add('bg-theme-text-dim');
        elSystemStatusIndicator.classList.remove('bg-theme-red', 'animate-pulse-glow');
        elSystemStatusText.innerText = 'System Offline';
        elSystemOfflineWarning.style.display = 'block';
        elPwmSlider.disabled = true;
    }

    elPwmDisplay.innerText = `${currentPwm}%`;
    elPwmSlider.value = currentPwm;

    // Controls for Live Mode
    if (!isSimulationMode) {
        elPwmSlider.disabled = true;
        btnStart.disabled = true;
        btnStop.disabled = true;
        btnStart.classList.add('opacity-50', 'cursor-not-allowed');
        btnStop.classList.add('opacity-50', 'cursor-not-allowed');
        elSystemOfflineWarning.style.display = 'none'; // Not relevant in Live Mode Monitoring
    } else {
        btnStart.disabled = false;
        btnStop.disabled = false;
        btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
        btnStop.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    // Telemetry Values
    if (!isSimulationMode) {
        if (telemetry.h2Ppm === 0 && h2PpmHistory10s.length <= 1) {
             elValH2.innerHTML = `WAITING... <span class="text-[14px] text-theme-text-dim ml-1 font-normal">PPM</span>`;
        } else {
             elValH2.innerHTML = `${telemetry.h2Ppm.toFixed(1)} <span class="text-[14px] text-theme-text-dim ml-1 font-normal">PPM</span>`;
        }
    } else {
        elValH2.innerHTML = `${telemetry.h2Ppm.toFixed(1)} <span class="text-[14px] text-theme-text-dim ml-1 font-normal">PPM</span>`;
    }

    // Electrical Metrics
    if (!isSimulationMode && assumedAmps === 0 && systemEfficiency === 0) {
         elValAmps.innerHTML = `WAITING... <span class="text-[12px] text-theme-text-dim font-normal">A</span>`;
         elValEfficiency.innerHTML = `WAITING... <span class="text-[12px] text-theme-text-dim font-normal">%</span>`;
    } else {
         elValAmps.innerHTML = `${assumedAmps.toFixed(2)} <span class="text-[12px] text-theme-text-dim font-normal">A</span>`;
         elValEfficiency.innerHTML = `${systemEfficiency.toFixed(0)} <span class="text-[12px] text-theme-text-dim font-normal">%</span>`;
    }

    // Mode Toggle Styling
    if (isSimulationMode) {
        btnModeSim.className = 'px-4 py-1 text-[12px] uppercase font-bold tracking-[1px] transition-colors duration-200 bg-theme-cyan text-black';
        btnModeLive.className = 'px-4 py-1 text-[12px] uppercase font-bold tracking-[1px] transition-colors duration-200 bg-transparent text-theme-text-dim hover:text-theme-cyan';

        livePowerCards.classList.add('hidden');
        simParamsCard.classList.remove('hidden');
        simParamsCard.classList.remove('disabled');
        simElectrolyte.disabled = false;
        simMaterial.disabled = false;
        simDistance.disabled = false;
    } else {
        btnModeLive.className = 'px-4 py-1 text-[12px] uppercase font-bold tracking-[1px] transition-colors duration-200 bg-theme-cyan text-black';
        btnModeSim.className = 'px-4 py-1 text-[12px] uppercase font-bold tracking-[1px] transition-colors duration-200 bg-transparent text-theme-text-dim hover:text-theme-cyan';

        livePowerCards.classList.remove('hidden');
        simParamsCard.classList.remove('hidden');
        simParamsCard.classList.add('disabled');
        simElectrolyte.disabled = true;
        simMaterial.disabled = true;
        simDistance.disabled = true;
    }

    // Water Logic
    if (!isSimulationMode) {
        elValWater.className = `text-lg font-bold text-theme-text-dim`;
        elValWater.innerHTML = `N/A <span class="text-[10px] text-theme-text-dim ml-1 font-normal" id="val-water-cm">(SENSOR DISCONNECTED)</span>`;
        elDryTankWarning.classList.add('hidden');
    } else {
        let waterStatus = telemetry.waterLevelCm > 8 ? 'Safe' : 'Low';
        let waterColorClass = telemetry.waterLevelCm > 8 ? 'text-theme-cyan' : 'text-theme-red';

        if (telemetry.waterLevelCm <= 0) {
            waterStatus = 'DRY';
            waterColorClass = 'text-theme-red animate-pulse-glow';
        }

        elValWater.className = `text-2xl font-bold ${waterColorClass}`;
        elValWater.innerHTML = `${waterStatus} <span class="text-[14px] text-theme-text-dim ml-1 font-normal" id="val-water-cm">(${telemetry.waterLevelCm.toFixed(1)} CM)</span>`;

        // Dry Tank Warning UI
        if (telemetry.waterLevelCm <= 0 && isRunning) {
            elDryTankWarning.classList.remove('hidden');
            elPwmSlider.disabled = true; // Lock UI
        } else {
            elDryTankWarning.classList.add('hidden');
            if (isRunning) elPwmSlider.disabled = false;
        }
    }

    // Chart
    h2Chart.data.datasets[0].data = h2History;
    h2Chart.update();
}

// --- Canvas Animation ---
let animationId;
const bubbles = [];

function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function drawCanvas() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Baking Soda Murky Water Logic
    let waterColorTank = 'rgba(0, 100, 255, 0.08)';
    let waterColorFluid = 'rgba(0, 150, 255, 0.15)';

    if (isSimulationMode && simElectrolyte.value === 'baking_soda') {
        const degradationPct = Math.min(1, bakingSodaRunTime / 120);
        // Transition from blue to murky greenish-brown
        // Clear Blue: (0, 150, 255) -> Murky: (100, 120, 50)
        const r = Math.floor(0 + (100 - 0) * degradationPct);
        const g = Math.floor(150 + (120 - 150) * degradationPct);
        const b = Math.floor(255 + (50 - 255) * degradationPct);
        const a1 = 0.08 + (0.4 - 0.08) * degradationPct; // Make less transparent
        const a2 = 0.15 + (0.5 - 0.15) * degradationPct;

        waterColorTank = `rgba(${r}, ${g}, ${b}, ${a1})`;
        waterColorFluid = `rgba(${r}, ${g}, ${b}, ${a2})`;
    }

    // Glass Tank Background / Water
    ctx.fillStyle = waterColorTank;
    ctx.fillRect(w * 0.05, h * 0.1, w * 0.9, h * 0.85);

    // Water fluid (visual level based on CM, mapping 20cm -> top, 0cm -> bottom)
    const waterHeightPct = Math.max(0, Math.min(1, telemetry.waterLevelCm / 20));
    const waterBaseY = h * 0.95;
    const waterTopY = waterBaseY - (h * 0.65 * waterHeightPct);

    ctx.fillStyle = waterColorFluid;
    ctx.fillRect(w * 0.05 + 5, waterTopY, w * 0.9 - 10, waterBaseY - waterTopY - 5);

    // Top water line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.moveTo(w * 0.05 + 5, waterTopY);
    ctx.lineTo(w * 0.95 - 5, waterTopY);
    ctx.stroke();

    // Electrodes setup
    const electrodeW = Math.min(w * 0.2, 50);

    // Distance Mapping (1cm to 10cm) -> Distance from center
    let distanceCm = 5;
    if (isSimulationMode) {
        distanceCm = parseFloat(simDistance.value);
    }
    const center = w * 0.5;
    const maxOffset = w * 0.35; // The max distance from center an electrode can be
    const offset = (distanceCm / 10) * maxOffset;

    const anodeX = center - offset;
    const cathodeX = center + offset;

    const electrodeTop = h * 0.2;
    const electrodeH = h * 0.65;

    const drawElectrode = (x, isAnode) => {
        const color = isAnode ? '#ffbf00' : '#00f2ff';
        const sign = isAnode ? '+' : '-';

        // Material fill color
        let fill = '#333';
        if (isSimulationMode) {
            const mat = simMaterial.value;
            if (mat === 'platinum') fill = '#e5e4e2'; // Metallic white
            else if (mat === 'graphite') fill = '#111'; // Pure black
            else fill = '#555'; // Dull grey for pencil
        }

        ctx.fillStyle = fill;
        ctx.fillRect(x - electrodeW/2, electrodeTop, electrodeW, electrodeH);

        // Active border
        ctx.strokeStyle = color;
        ctx.lineWidth = isRunning && currentPwm > 0 ? 2 + (currentPwm / 50) : 1;
        ctx.strokeRect(x - electrodeW/2, electrodeTop, electrodeW, electrodeH);

        // Label
        ctx.fillStyle = color;
        ctx.font = '12px var(--font-mono)';
        ctx.textAlign = 'center';
        ctx.fillText(sign, x, electrodeTop - 8);
    };

    drawElectrode(anodeX, true);
    drawElectrode(cathodeX, false);

    // Bubble Spawn logic
    const spawnBubble = (isAnode) => {
        const base = isAnode ? anodeX : cathodeX;
        bubbles.push({
            x: base + (Math.random() - 0.5) * (electrodeW * 0.7),
            y: electrodeTop + electrodeH - (Math.random() * 20),
            r: Math.random() * 2 + 1.5,
            s: Math.random() * 2 + 0.5 + (currentPwm/100)*2,
            w: Math.random() * Math.PI * 2,
            ws: Math.random() * 0.05 + 0.02,
            isAnode
        });
    };

    let shouldBubble = false;
    let spawnMultiplier = 0;

    if (isSimulationMode) {
        if (isRunning && currentPwm > 0 && telemetry.waterLevelCm > 5) { // Needs water to bubble
            shouldBubble = true;
            // Tie to theoretical current. ~3.36 amps is heavy bubbling now.
            // Map 0-5 amps roughly to 0-3 visual spawn multiplier
            spawnMultiplier = Math.min(10, currentSimulationAmps) * 0.8;

            // Ensure some bubbles if running but low efficiency
            if (spawnMultiplier < 0.1) spawnMultiplier = 0.1;
        }
    } else {
        // Live Mode bubbling depends entirely on sensor data
        if (telemetry.h2Ppm > 0) {
            shouldBubble = true;
            // Dynamic bubbling scale based on PPM value
            // 0-100+ PPM roughly mapped to multiplier
            spawnMultiplier = Math.min(10, (telemetry.h2Ppm / 20));
            if (spawnMultiplier < 0.2) spawnMultiplier = 0.2; // minimum bubbling threshold when producing
        }
    }

    if (shouldBubble) {
        // Hydrogen (Cathode)
        const h2Rate = spawnMultiplier * 3;
        for(let i=0; i<Math.floor(h2Rate); i++) spawnBubble(false);
        if(Math.random() < h2Rate % 1) spawnBubble(false);

        // Oxygen (Anode)
        const o2Rate = spawnMultiplier * 1.5;
        for(let i=0; i<Math.floor(o2Rate); i++) spawnBubble(true);
        if(Math.random() < o2Rate % 1) spawnBubble(true);
    }

    // Draw and move bubbles
    for(let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.y -= b.s;
        b.w += b.ws;
        const wobbleX = Math.sin(b.w) * 1.5;

        ctx.beginPath();
        ctx.arc(b.x + wobbleX, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = b.isAnode ? 'rgba(255, 191, 0, 0.7)' : 'rgba(180, 240, 255, 0.7)';
        ctx.fill();

        // Remove if reached surface
        if (b.y < waterTopY) {
           bubbles.splice(i, 1);
        }
    }

    // Glass structure borders
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.strokeRect(w * 0.05, h * 0.1, w * 0.9, h * 0.85);

    // Glass reflections
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fillRect(w * 0.05, h * 0.1, w * 0.15, h * 0.85);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
    ctx.fillRect(w * 0.85, h * 0.1, w * 0.1, h * 0.85);

    animationId = requestAnimationFrame(drawCanvas);
}

// Start rendering loop
animationId = requestAnimationFrame(drawCanvas);


// --- Event Listeners ---

btnStart.addEventListener('click', () => {
    if (!isRunning) {
        isRunning = true;
        if (currentPwm === 0) currentPwm = 45;
        addSystemMessage('SYSTEM ARMED');
        updateUI();
    }
});

btnStop.addEventListener('click', () => {
    isRunning = false;
    currentPwm = 0;
    addSystemMessage('EMERGENCY STOP ENGAGED');
    updateUI();
});

elPwmSlider.addEventListener('input', (e) => {
    currentPwm = parseInt(e.target.value);
    elPwmDisplay.innerText = `${currentPwm}%`;
    addSystemMessage(`PWM ADJUSTED TO ${currentPwm}%`);
});

// Reset simulation fault
function checkSimReset() {
    if (isSimulationMode && telemetry.waterLevelCm <= 0) {
        telemetry.waterLevelCm = 20;
        telemetry.totalH2mL = 0; // also reset gas
        addSystemMessage('SIMULATION PARAMETER CHANGED. TANK REFILLED.');
        updateUI();
    }
}

// Mode Buttons
btnModeLive.addEventListener('click', () => {
    if (isSimulationMode) {
        isSimulationMode = false;
        // Wipe everything
        telemetry.h2Ppm = 0;
        telemetry.totalH2mL = 0;
        assumedAmps = 0;
        systemEfficiency = 0;
        h2PpmHistory10s = [];
        h2History = Array.from({ length: maxHistoryPoints }, () => 0);
        addSystemMessage('SWITCHED TO LIVE TELEMETRY MODE');
        updateUI();
    }
});

btnModeSim.addEventListener('click', () => {
    if (!isSimulationMode) {
        isSimulationMode = true;
        telemetry.waterLevelCm = 20; // Ensure tank has water
        addSystemMessage('SWITCHED TO SIMULATION MODE');
        updateUI();
    }
});

simDistance.addEventListener('input', (e) => {
    simDistanceDisplay.innerText = `${e.target.value} cm`;
    checkSimReset();
});

simElectrolyte.addEventListener('change', () => {
    bakingSodaRunTime = 0;
    checkSimReset();
});

simMaterial.addEventListener('change', () => {
    checkSimReset();
});


// --- Uptime Loop ---
setInterval(() => {
    uptimeSeconds++;
    elUptimeDisplay.innerText = formatUptime(uptimeSeconds);
}, 1000);


// --- Simulation Physics Engine & Logic Loop ---
const CONSTANTS = {
    voltage: 16.8, // 4S BMS system
    yieldMlPerAmpMin: 7.5,
    containerVolumeMl: 5000,
    ventLeakPpmPerSec: 50,

    conductivities: {
        'distilled': 0.01,
        'baking_soda': 0.4,
        'naoh': 0.8,
        'koh': 1.0
    },

    materials: {
        'platinum': 0.1,
        'graphite': 1.0,
        'pencil': 1.5 // Dramatically lowered from 5.0
    }
};

let currentSimulationAmps = 0;

setInterval(() => {
    if (isSimulationMode) {
        // --- SIMULATION MODE ---

        // Handle dry tank override
        if (telemetry.waterLevelCm <= 0 && isRunning) {
            currentPwm = 0;
            if (currentSimulationAmps > 0) {
                addSystemMessage('SYSTEM FAULT: DRY TANK');
            }
        }

        let currentDraw = 0;

        if (isRunning && currentPwm > 0 && telemetry.waterLevelCm > 0) {
            // Get inputs
            const distanceCm = parseFloat(simDistance.value);
            const materialRes = CONSTANTS.materials[simMaterial.value];
            let conductivity = CONSTANTS.conductivities[simElectrolyte.value];

            // Baking Soda degradation
            if (simElectrolyte.value === 'baking_soda') {
                bakingSodaRunTime++;
                // Drop to 50% efficiency over 120 seconds
                const degradationFactor = Math.max(0.5, 1.0 - (bakingSodaRunTime / 120) * 0.5);
                conductivity *= degradationFactor;
            }

            // Calculate Total Resistance: Flattened distance effect so it still reacts at a distance.
            const distanceFactor = 0.2 + (distanceCm * 0.08);
            const totalResistance = (materialRes * distanceFactor) / conductivity;

            // Calculate Amperage: (16.8V / Total Resistance) * (PWM / 100)
            currentDraw = (CONSTANTS.voltage / totalResistance) * (currentPwm / 100);

            // Water consumes slowly proportional to amperage
            telemetry.waterLevelCm -= (currentDraw * 0.005);
        }

        currentSimulationAmps = currentDraw;

        // H2 Production (mL/min) = Amperage * 7.5
        // Per second: (Amperage * 7.5) / 60
        const h2MlPerSec = (currentDraw * CONSTANTS.yieldMlPerAmpMin) / 60;
        telemetry.totalH2mL += h2MlPerSec;

        // Convert total H2 volume to PPM in 5000mL container
        let calculatedPpm = (telemetry.totalH2mL / CONSTANTS.containerVolumeMl) * 1000000;

        // Vent leak
        calculatedPpm -= CONSTANTS.ventLeakPpmPerSec;
        calculatedPpm = Math.max(0, calculatedPpm);

        // Back-calculate totalH2mL from the new PPM (so it doesn't drop below 0 effectively)
        telemetry.totalH2mL = (calculatedPpm * CONSTANTS.containerVolumeMl) / 1000000;
        telemetry.h2Ppm = calculatedPpm;

    } else {
        // --- LIVE TELEMETRY MODE ---
        currentSimulationAmps = 0;
        // Data comes from polling the backend now.
    }

    // Common logic (history, math, UI)

    // Calculate Rate of Change (H2_mL_per_min) over a 10s rolling window
    const now = Date.now();
    h2PpmHistory10s.push({time: now, ppm: telemetry.h2Ppm});
    // Remove entries older than 10 seconds
    h2PpmHistory10s = h2PpmHistory10s.filter(entry => (now - entry.time) <= 10000);

    let currentH2MlPerMin = 0;
    if (h2PpmHistory10s.length > 1) {
        const oldest = h2PpmHistory10s[0];
        const newest = h2PpmHistory10s[h2PpmHistory10s.length - 1];
        const timeDiffSec = (newest.time - oldest.time) / 1000;

        if (timeDiffSec > 0) {
            // PPM change over the window
            const ppmDelta = newest.ppm - oldest.ppm;

            // Account for vent leak in the delta calculation to get true production
            // If we didn't produce anything, the delta would be exactly -ventLeak over time.
            // True Delta = Observed Delta + Vent Leak over that time
            const ventLoss = CONSTANTS.ventLeakPpmPerSec * timeDiffSec;
            const truePpmDelta = ppmDelta + ventLoss;

            // Convert true PPM delta back to mL
            const deltaMl = (truePpmDelta * CONSTANTS.containerVolumeMl) / 1000000;

            // Calculate rate per minute
            currentH2MlPerMin = (deltaMl / timeDiffSec) * 60;
        }
    }

    // Clamp to 0
    currentH2MlPerMin = Math.max(0, currentH2MlPerMin);

    // Formula: Amps = H2_mL_per_min / 7.46
    assumedAmps = currentH2MlPerMin / 7.46;

    // Calculate Efficiency
    if (isSimulationMode) {
        if (currentPwm > 0 && isRunning && telemetry.waterLevelCm > 0) {
            // Theoretical max assumes perfect conditions (Platinum, 1cm distance, KOH)
            const perfectResistance = (CONSTANTS.materials['platinum'] * 1) / CONSTANTS.conductivities['koh']; // 0.1
            const maxAmps = (CONSTANTS.voltage / perfectResistance) * (currentPwm / 100);
            const maxH2MlPerMin = maxAmps * 7.46;

            if (maxH2MlPerMin > 0) {
                systemEfficiency = (currentH2MlPerMin / maxH2MlPerMin) * 100;
                systemEfficiency = Math.min(100, Math.max(0, systemEfficiency)); // Clamp 0-100
            } else {
                systemEfficiency = 0;
            }
        } else {
            systemEfficiency = 0;
            assumedAmps = 0; // Force to 0 if not running
        }
    } else {
        // LIVE MODE - Dashboard controls disabled, assumes 100% PWM always running
        const perfectResistance = (CONSTANTS.materials['platinum'] * 1) / CONSTANTS.conductivities['koh']; // 0.1
        const maxAmps = (CONSTANTS.voltage / perfectResistance) * 1.0; // 100% PWM
        const maxH2MlPerMin = maxAmps * 7.46;

        if (maxH2MlPerMin > 0) {
            systemEfficiency = (currentH2MlPerMin / maxH2MlPerMin) * 100;
            systemEfficiency = Math.min(100, Math.max(0, systemEfficiency)); // Clamp 0-100
        } else {
            systemEfficiency = 0;
        }
    }

    // Clamp water level
    telemetry.waterLevelCm = Math.min(20, Math.max(0, telemetry.waterLevelCm));

    // Update History
    h2History.shift();
    h2History.push(telemetry.h2Ppm);

    // Flash values for feedback
    triggerGlow(elValH2);
    triggerGlow(elValWater);

    // Render updates
    updateUI();

}, 1000);

// Initial Render
updateUI();