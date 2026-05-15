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
const elValPump = document.getElementById('val-pump');
const elPumpIcon = document.getElementById('pump-icon');
const elSystemMessages = document.getElementById('system-messages');

const elPwmSlider = document.getElementById('pwm-slider');
const elPwmDisplay = document.getElementById('pwm-display');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnTriggerPump = document.getElementById('btn-trigger-pump');

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
    pumpActive: false,
    manualPumpOverride: false,
    totalH2mL: 0 // Track total H2 produced
};

// Simulation State
let bakingSodaRunTime = 0; // seconds

// History for Chart
const maxHistoryPoints = 60;
let h2History = Array.from({ length: maxHistoryPoints }, () => 0);

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
        elPwmSlider.disabled = false;
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

    // Telemetry Values
    elValH2.innerHTML = `${telemetry.h2Ppm.toFixed(1)} <span class="text-[14px] text-theme-text-dim ml-1 font-normal">PPM</span>`;

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
    let waterStatus = telemetry.waterLevelCm > 8 ? 'Safe' : 'Low';
    let waterColorClass = telemetry.waterLevelCm > 8 ? 'text-theme-cyan' : 'text-theme-red';

    elValWater.className = `text-2xl font-bold ${waterColorClass}`;
    elValWater.innerHTML = `${waterStatus} <span class="text-[14px] text-theme-text-dim ml-1 font-normal" id="val-water-cm">(${telemetry.waterLevelCm.toFixed(1)} CM)</span>`;

    // Pump Logic
    if (telemetry.pumpActive || telemetry.manualPumpOverride) {
        elValPump.className = `text-2xl font-bold text-theme-cyan`;
        elValPump.innerText = 'Active';
        elPumpIcon.className = `fa-solid fa-fan text-theme-cyan animate-spin-fast`;
    } else {
        elValPump.className = `text-2xl font-bold text-theme-text-dim`;
        elValPump.innerText = 'Idle';
        elPumpIcon.className = `fa-solid fa-fan text-theme-text-dim`;
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

    if (isRunning && currentPwm > 0 && telemetry.waterLevelCm > 5) { // Needs water to bubble
        // Bubble density tied to Amperage in Simulation, PWM in Live
        let spawnMultiplier = 0;
        if (isSimulationMode) {
            // Tie to theoretical current. High efficiency might yield ~10-20 amps.
            // Cap visual scaling around 20 amps for sanity.
            spawnMultiplier = Math.min(20, currentSimulationAmps) / 5; // e.g. 10 Amps = 2.0 multiplier
        } else {
            spawnMultiplier = (currentPwm / 100) * 2;
        }

        // Ensure some bubbles if running but low efficiency
        if (spawnMultiplier < 0.1) spawnMultiplier = 0.1;

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

btnTriggerPump.addEventListener('mousedown', () => {
    telemetry.manualPumpOverride = true;
    addSystemMessage('MANUAL PUMP OVERRIDE ACTIVE');
    updateUI();
});

btnTriggerPump.addEventListener('mouseup', () => {
    telemetry.manualPumpOverride = false;
    addSystemMessage('MANUAL PUMP OVERRIDE RELEASED');
    updateUI();
});
btnTriggerPump.addEventListener('mouseleave', () => {
    telemetry.manualPumpOverride = false;
});

// Mode Buttons
btnModeLive.addEventListener('click', () => {
    if (isSimulationMode) {
        isSimulationMode = false;
        addSystemMessage('SWITCHED TO LIVE TELEMETRY MODE');
        updateUI();
    }
});

btnModeSim.addEventListener('click', () => {
    if (!isSimulationMode) {
        isSimulationMode = true;
        addSystemMessage('SWITCHED TO SIMULATION MODE');
        updateUI();
    }
});

simDistance.addEventListener('input', (e) => {
    simDistanceDisplay.innerText = `${e.target.value} cm`;
});

simElectrolyte.addEventListener('change', () => {
    // Reset degradation when changed
    bakingSodaRunTime = 0;
});


// --- Uptime Loop ---
setInterval(() => {
    uptimeSeconds++;
    elUptimeDisplay.innerText = formatUptime(uptimeSeconds);
}, 1000);


// --- Simulation Physics Engine & Logic Loop ---
const CONSTANTS = {
    voltage: 12.0,
    yieldMlPerAmpMin: 7.5,
    containerVolumeMl: 5000,
    ventLeakPpmPerSec: 50,

    conductivities: {
        'distilled': 0.01,
        'baking_soda': 0.4,
        'koh': 1.0
    },

    materials: {
        'platinum': 0.1,
        'graphite': 1.0,
        'pencil': 5.0
    }
};

let currentSimulationAmps = 0;

setInterval(() => {
    if (isSimulationMode) {
        // --- SIMULATION MODE ---
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

            // Calculate Total Resistance: (Material Resistance * Distance) / Conductivity
            const totalResistance = (materialRes * distanceCm) / conductivity;

            // Calculate Amperage: (12V / Total Resistance) * (PWM / 100)
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
        // In reality, this data would come from Socket.io.
        // For visual sake of the dashboard when no data is arriving, slowly vent
        telemetry.h2Ppm = Math.max(0, telemetry.h2Ppm - CONSTANTS.ventLeakPpmPerSec);
    }

    // Common logic (Pump, history, UI)

    // Simulate Pump logic (Auto refill if low, or manual override)
    if (telemetry.waterLevelCm < 8) {
        if (!telemetry.pumpActive) addSystemMessage('WATER LOW: AUTO-PUMP ENGAGED');
        telemetry.pumpActive = true;
    } else if (telemetry.waterLevelCm > 18 && telemetry.pumpActive) {
        telemetry.pumpActive = false;
        addSystemMessage('WATER SAFE: AUTO-PUMP DISENGAGED');
    }

    if (telemetry.pumpActive || telemetry.manualPumpOverride) {
        telemetry.waterLevelCm += 0.5; // Fill speed
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

// Setup Socket.io placeholder
const socket = io();

// Example Socket.io Listener for Real Data
socket.on('telemetry', (data) => {
    if (!isSimulationMode) {
        telemetry.h2Ppm = data.mq2_ppm;
        telemetry.waterLevelCm = data.ultrasonic_cm;
        telemetry.pumpActive = data.pump_status;

        // Note: history update and UI update handled in 1s interval to keep sync,
        // but can be forced here if immediate response is desired.
    }
});

// Initial Render
updateUI();