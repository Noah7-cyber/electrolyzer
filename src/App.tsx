import React, { useState, useEffect, useRef } from 'react';
import { Activity, Battery, BatteryCharging, Zap, Power, Sun, Droplets, Gauge, AlertCircle, Timer } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const DataCard = ({ title, value, unit, icon: Icon, color = "cyan" }: any) => {
  const isCyan = color === "cyan" || color === "var(--color-theme-cyan)";
  const valColor = isCyan ? 'text-theme-cyan' : 'text-theme-amber';
  
  return (
    <div className="bg-theme-card border border-theme-border p-4 rounded relative overflow-hidden flex flex-col justify-center min-h-[90px]">
      <div className="text-[10px] text-theme-text-dim uppercase tracking-[1px] mb-2">{title}</div>
      <div className={`text-2xl font-bold ${valColor}`}>
        {typeof value === 'number' ? value.toFixed(1) : value} <span className="text-[14px] text-theme-text-dim ml-1 font-normal">{unit}</span>
      </div>
      {Icon && <Icon className={`absolute right-4 bottom-4 w-12 h-12 opacity-[0.03] ${valColor}`} />}
    </div>
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-theme-bg border border-theme-border p-2 text-theme-cyan text-[12px] rounded">
        <p className="font-mono tracking-wider">H2: {payload[0].value.toFixed(1)} PPM</p>
      </div>
    );
  }
  return null;
};

// Canvas animation component for Electrolysis simulation
function ElectrolyzerTank({ isRunning, pwm }: { isRunning: boolean, pwm: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle Resize
    const resize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    window.addEventListener('resize', resize);
    resize();

    // Animation state
    let animationId: number;
    const bubbles: {x: number, y: number, r: number, s: number, w: number, ws: number, isAnode: boolean}[] = [];
    
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      // Glass Tank Background / Water
      ctx.fillStyle = 'rgba(0, 100, 255, 0.08)';
      ctx.fillRect(w * 0.05, h * 0.1, w * 0.9, h * 0.85);

      // Water fluid
      ctx.fillStyle = 'rgba(0, 150, 255, 0.15)';
      ctx.fillRect(w * 0.05 + 5, h * 0.3, w * 0.9 - 10, h * 0.65 - 5);
      
      // Top water line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 242, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.moveTo(w * 0.05 + 5, h * 0.3);
      ctx.lineTo(w * 0.95 - 5, h * 0.3);
      ctx.stroke();

      // Electrodes setup
      const electrodeW = Math.min(w * 0.2, 50);
      const anodeX = w * 0.3;
      const cathodeX = w * 0.7;
      const electrodeTop = h * 0.2;
      const electrodeH = h * 0.65;
      
      // Constants for electrodes drawing
      const drawElectrode = (x: number, isAnode: boolean) => {
        const color = isAnode ? '#ffbf00' : '#00f2ff';
        const sign = isAnode ? '+' : '-';
        
        ctx.fillStyle = '#333';
        ctx.fillRect(x - electrodeW/2, electrodeTop, electrodeW, electrodeH);
        
        // Active border
        ctx.strokeStyle = color;
        ctx.lineWidth = isRunning && pwm > 0 ? 2 + (pwm / 50) : 1;
        ctx.strokeRect(x - electrodeW/2, electrodeTop, electrodeW, electrodeH);
        
        // Label
        ctx.fillStyle = color;
        ctx.font = '12px var(--font-mono)';
        ctx.textAlign = 'center';
        ctx.fillText(sign, x, electrodeTop - 8);
      };

      drawElectrode(anodeX, true);   // Anode
      drawElectrode(cathodeX, false); // Cathode

      // Bubble Spawn logic (Frame-rate bound is fine for visual fx)
      const spawnBubble = (isAnode: boolean) => {
        const base = isAnode ? anodeX : cathodeX;
        bubbles.push({
          x: base + (Math.random() - 0.5) * (electrodeW * 0.7),
          y: electrodeTop + electrodeH - (Math.random() * 20),
          r: Math.random() * 2 + 1.5,
          s: Math.random() * 2 + 0.5 + (pwm/100)*2,
          w: Math.random() * Math.PI * 2,
          ws: Math.random() * 0.05 + 0.02,
          isAnode
        });
      };

      if (isRunning && pwm > 0) {
        const spawnMultiplier = (pwm / 100);
        // Hydrogen (Cathode) gets double the bubbles of Oxygen
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
        if (b.y < h * 0.3) {
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

      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, [isRunning, pwm]);

  return (
    <div ref={containerRef} className="absolute inset-0 p-4">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [currentElectrolysisPWM, setCurrentElectrolysisPWM] = useState(0);
  const [uptime, setUptime] = useState(0);
  
  const [data, setData] = useState({
    h2Ppm: 0,
    cellV: 0,
    cellA: 0,
    batteryV: 12.2,
    batteryPct: 95
  });

  const [h2History, setH2History] = useState<{ time: number, ppm: number }[]>(() => {
    return Array.from({length: 40}).map((_, i) => ({ time: i, ppm: 0 }));
  });

  // Use refs inside interval to avoid constantly recreating it
  const isRunningRef = useRef(isRunning);
  const pwmRef = useRef(currentElectrolysisPWM);

  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { pwmRef.current = currentElectrolysisPWM; }, [currentElectrolysisPWM]);

  useEffect(() => {
    const timer = setInterval(() => {
      setUptime(u => {
        const nextUptime = u + 1;
        const running = isRunningRef.current;
        const pwm = pwmRef.current;

        setData(prev => {
           // Simulate realistic electrical behavior and lags
           const targetA = running ? (pwm / 100) * 15.0 : 0; 
           const newA = prev.cellA + (targetA - prev.cellA) * 0.15 + (running ? (Math.random() * 0.2 - 0.1) : 0);
           const targetV = running ? 2.5 + (pwm / 100) * 1.5 : 0; 
           const newV = prev.cellV + (targetV - prev.cellV) * 0.15 + (running ? (Math.random() * 0.05 - 0.025) : 0);
           
           const targetH2 = running ? (newA * 8) : Math.max(0, prev.h2Ppm - 5);
           const newH2 = prev.h2Ppm + (targetH2 - prev.h2Ppm) * 0.1 + (running ? (Math.random()*2 - 1) : - (Math.random() * 0.5));

           const currentDraw = newA * 0.005; // Battery sag simulation
           const newBattV = 12.2 - currentDraw - (nextUptime * 0.0005); 
           const newBattPct = Math.max(0, Math.min(100, ((newBattV - 10.5) / (12.6 - 10.5)) * 100));

           const finalH2 = Math.max(0, newH2);

           setH2History(hist => [...hist.slice(1), { time: nextUptime, ppm: finalH2 }]);

           return {
             h2Ppm: finalH2,
             cellV: Math.max(0, newV),
             cellA: Math.max(0, newA),
             batteryV: Math.max(10.5, newBattV),
             batteryPct: newBattPct
           };
        });
        return nextUptime;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getBatteryIcon = (pct: number) => {
    if (pct > 80) return <Battery className="w-5 h-5 text-theme-amber opacity-30" />;
    if (pct > 20) return <BatteryCharging className="w-5 h-5 text-theme-amber opacity-30" />;
    return <Battery className="w-5 h-5 text-theme-red opacity-30" />;
  };

  return (
    <div className="relative flex flex-col h-screen overflow-hidden bg-theme-bg text-theme-text-main font-mono">
      <div className="grid-bg"></div>
      
      {/* Header */}
      <header className="h-[70px] border-b border-theme-border bg-theme-panel px-6 flex items-center justify-between z-10 shrink-0">
         <div className="flex flex-col">
              <h1 className="text-[18px] tracking-[2px] text-theme-cyan uppercase flex items-center gap-2">
                 <Droplets className="w-5 h-5" />
                 ELECTROLYZER ALPHA-9
              </h1>
              <p className="text-[10px] text-theme-text-dim">INDUSTRIAL TELEMETRY NODE // 0xAF234</p>
         </div>

         <div className="flex items-center gap-6">
            <div className="bg-theme-cyan-dim border border-theme-cyan text-theme-cyan px-3 py-1 rounded text-[12px] flex items-center gap-2 uppercase">
               <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-theme-red shadow-[0_0_8px_var(--color-theme-red)] animate-pulse' : 'bg-theme-text-dim'}`}></div>
               {isRunning ? 'System Armed' : 'System Offline'}
            </div>
            <div className="text-right">
               <div className="text-[10px] text-theme-text-dim flex items-center justify-end gap-1"><Timer className="w-3 h-3"/> UPTIME</div>
               <div className="text-[14px]">{formatUptime(uptime)}</div>
            </div>
         </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[240px_1fr_240px] gap-[1px] bg-theme-border overflow-hidden min-h-0 z-10">
        {/* Left Sidebar */}
        <aside className="bg-theme-panel p-5 flex flex-col gap-5 overflow-y-auto min-h-0">
            <div className="bg-theme-card border border-theme-border p-4 rounded relative">
               <div className="text-[10px] text-theme-text-dim uppercase tracking-[1px] mb-2 flex items-center gap-2"><Zap className="w-3 h-3"/> Power Station</div>
               <div className="text-2xl font-bold text-theme-text-main mb-1">
                 {data.batteryV.toFixed(2)}<span className="text-[14px] text-theme-text-dim ml-1">V</span>
               </div>
               {/* battery bar */}
               <div className="w-full h-2 bg-[#333] rounded overflow-hidden mt-2 relative">
                 <div className="h-full bg-theme-amber transition-all duration-300" style={{ width: `${data.batteryPct}%` }}></div>
               </div>
               <div className="flex justify-between items-center mt-2 text-[10px]">
                 <span className="text-theme-text-dim">BATTERY LEVEL</span>
                 <span className="text-theme-amber">{data.batteryPct.toFixed(0)}%</span>
               </div>
               <div className="absolute right-4 top-4">
                 {getBatteryIcon(data.batteryPct)}
               </div>
            </div>

            <div className="bg-theme-card border border-theme-border p-4 rounded relative">
               <div className="text-[10px] text-theme-text-dim uppercase tracking-[1px] mb-2 flex items-center gap-2"><Sun className="w-3 h-3"/> Solar Charging</div>
               <div className="text-2xl font-bold text-theme-amber">
                   4.2<span className="text-[14px] text-theme-text-dim ml-1">A</span>
               </div>
               <div className="text-[10px] mt-1 text-theme-text-dim">INPUT: 18.4V NOMINAL</div>
            </div>

            <div className="bg-theme-card border border-theme-border p-4 rounded relative">
               <div className="text-[10px] text-theme-text-dim uppercase tracking-[1px] mb-2 flex items-center gap-2">Cell Temp</div>
               <div className="text-2xl font-bold text-theme-text-main mb-1">
                 {(isRunning ? 42.8 + (currentElectrolysisPWM / 50) : 24.2).toFixed(1)}<span className="text-[14px] text-theme-text-dim ml-1">°C</span>
               </div>
            </div>

            {!isRunning && (
                <div className="mt-2 text-[10px] text-theme-red leading-relaxed p-3 border border-theme-red bg-theme-red/10 rounded">
                    <div className="flex items-center gap-1 font-bold mb-1"><AlertCircle className="w-3 h-3"/> SYSTEM OFFLINE</div>
                    System must be armed to send PWM signals to the electrode array.
                </div>
            )}
        </aside>

        {/* Canvas Render Area */}
        <section className="bg-theme-bg relative flex justify-center items-center overflow-hidden min-h-0" style={{background: 'radial-gradient(circle at center, #1a1a1a 0%, #0a0a0a 100%)'}}>
            <ElectrolyzerTank isRunning={isRunning} pwm={currentElectrolysisPWM} />
        </section>

        {/* Right Sidebar */}
        <aside className="bg-theme-panel p-5 flex flex-col gap-5 overflow-y-auto min-h-0">
            <DataCard title="H2 Concentration" value={data.h2Ppm} unit="PPM" color="cyan" />
            <DataCard title="Cell Voltage" value={data.cellV} unit="V" color="cyan" />
            <DataCard title="Electrolysis Current" value={data.cellA} unit="A" color="cyan" />
            
            <div className="bg-theme-card border border-theme-border p-4 rounded flex-1 min-h-[100px]">
               <div className="text-[10px] text-theme-text-dim uppercase tracking-[1px] mb-2">System Messages</div>
               <div className="text-[10px] text-theme-text-dim leading-[1.4] font-mono">
                  [14:22:01] AUTO-FLUSH INITIATED<br/>
                  [14:22:45] CURRENT LIMIT STABLE<br/>
                  [14:23:09] H2 TARGET REACHED<br/>
                  {isRunning && `[${new Date().toLocaleTimeString('en-US', { hour12: false })}] PWM AT ${currentElectrolysisPWM}%`}
               </div>
            </div>
        </aside>
      </main>

      <footer className="h-auto lg:h-[180px] border-t border-theme-border bg-theme-panel grid grid-cols-1 lg:grid-cols-2 p-6 gap-6 z-10 shrink-0">
        <div className="flex flex-col justify-center gap-4">
          <div className="text-[10px] text-theme-text-dim uppercase tracking-[1px]">Process Control</div>
          <div className="flex items-center gap-4">
             <span className="text-[12px] text-theme-text-main w-8">PWM</span>
             <input 
                type="range" 
                min="0" 
                max="100" 
                disabled={!isRunning}
                value={currentElectrolysisPWM} 
                onChange={e => setCurrentElectrolysisPWM(Number(e.target.value))} 
                className="flex-1"
             />
             <span className="text-theme-cyan w-10 text-[14px]">{currentElectrolysisPWM}%</span>
          </div>
          <div className="flex gap-4">
             <button 
               className="elegant-button flex-1"
               onClick={() => {
                  if (!isRunning) setIsRunning(true);
                  if (!isRunning && currentElectrolysisPWM === 0) setCurrentElectrolysisPWM(45);
               }}
             >
               Start System
             </button>
             <button 
               className="elegant-button stop flex-1"
               onClick={() => {
                  setIsRunning(false);
                  setCurrentElectrolysisPWM(0);
               }}
             >
               Emergency Stop
             </button>
          </div>
        </div>

        <div className="relative border border-theme-border bg-black/30 rounded overflow-hidden flex flex-col min-h-[100px]">
           <div className="text-[10px] text-theme-text-dim uppercase tracking-[1px] absolute top-2 left-2 z-10">Hydrogen Production Rate</div>
           <div className="flex-1 w-full pt-6">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={h2History} margin={{ top: 10, right: 0, left: -40, bottom: -10 }}>
                  <CartesianGrid strokeDasharray="4" stroke="rgba(255,255,255,0.1)" vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis stroke="var(--color-theme-text-dim)" domain={[0, 160]} tick={{ fill: 'var(--color-theme-text-dim)', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} isAnimationActive={false} />
                  <Area 
                    type="monotone" 
                    dataKey="ppm" 
                    stroke="var(--color-theme-cyan)" 
                    strokeWidth={1} 
                    dot={false} 
                    isAnimationActive={false} 
                    fill="rgba(0,242,255,0.1)"
                  />
                </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>
      </footer>
    </div>
  );
}
