import { useState, useEffect } from 'react';
import { Icon } from './common/Icon';
import { SystemStats, getHostSysStats } from '../lib/tauri';

export function ResourceMonitor() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchStats = async () => {
      try {
        const result = await getHostSysStats();
        if (active) {
          setStats(result);
          setError(null);
        }
      } catch (e: any) {
        if (active) {
          setError(e.toString());
        }
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return (
      <div className="double-bezel">
        <div className="double-bezel-inner flex flex-col gap-sm">
          <div className="flex items-center gap-xs text-danger">
            <Icon name="error" size={18} />
            <h3 className="text-sm font-semibold tracking-tight">Host Telemetry Offline</h3>
          </div>
          <p className="text-muted text-xs">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="double-bezel">
        <div className="double-bezel-inner flex flex-col items-center justify-center py-12 gap-sm">
          <Icon name="vital_signs" size={24} className="text-accent spinner" />
          <div className="text-muted text-xs tracking-wide">Streaming real-time host telemetry...</div>
        </div>
      </div>
    );
  }

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d > 0 ? `${d}d ` : ''}${h}h ${m}m`;
  };

  const getProgressColor = (percent: number) => {
    if (percent > 85) return 'var(--gc-danger)';
    if (percent > 70) return 'var(--gc-warning)';
    return 'var(--gc-accent)';
  };

  const memPercent = (stats.used_memory_mb / Math.max(1, stats.total_memory_mb)) * 100;

  const hasGpu = Boolean(stats.gpu_name);
  const vramTotal = stats.gpu_vram_total_mb || 0;
  const vramUsed = stats.gpu_vram_used_mb || 0;
  const vramPercent = vramTotal > 0 ? (vramUsed / vramTotal) * 100 : 0;
  const gpuTemp = stats.gpu_temp_celsius;

  return (
    <div className="double-bezel">
      <div className="double-bezel-inner flex flex-col gap-lg">
        
        {/* Header telemetry banner */}
        <div className="flex justify-between items-center pb-3 border-b border-[var(--gc-border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-accent shadow-sm">
              <Icon name="dns" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--gc-text)] tracking-tight">{stats.host_name}</h3>
                <span 
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[var(--gc-squircle-sm)] text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase tracking-widest whitespace-nowrap shrink-0"
                  style={{ borderRadius: 'var(--gc-squircle-sm)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Live Host
                </span>
              </div>
              <p className="text-muted text-[11px] mt-0.5">{stats.os_name}</p>
            </div>
          </div>
          
          <div 
            className="flex items-center gap-1.5 text-muted text-xs bg-[var(--gc-surface-sunken)] px-2.5 py-1 rounded-[var(--gc-squircle-sm)] border border-[var(--gc-border)] whitespace-nowrap shrink-0"
            style={{ borderRadius: 'var(--gc-squircle-sm)' }}
          >
            <Icon name="schedule" size={12} className="text-accent" />
            <span className="text-mono font-medium text-[var(--gc-text)]">{formatUptime(stats.uptime_seconds)}</span>
          </div>
        </div>

        {/* GPU Section (Hero Telemetry) */}
        {hasGpu ? (
          <div className="p-3.5 rounded-xl bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)] shadow-inner flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Icon name="auto_awesome" size={15} className="text-accent animate-pulse" />
                <span className="text-xs font-semibold text-[var(--gc-text)] tracking-tight">
                  {stats.gpu_name}
                </span>
              </div>

              {gpuTemp !== undefined && gpuTemp !== null && (
                <div 
                  className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-[var(--gc-squircle-sm)] border whitespace-nowrap shrink-0 ${
                    gpuTemp > 80 
                      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' 
                      : gpuTemp > 68 
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' 
                      : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  }`}
                  style={{ borderRadius: 'var(--gc-squircle-sm)' }}
                >
                  <Icon name="local_fire_department" size={12} />
                  <span>{gpuTemp}°C</span>
                </div>
              )}
            </div>

            {/* VRAM Metric */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted text-[11px] font-medium">VRAM Allocation</span>
                <span className="text-mono text-[11px] font-semibold text-accent">
                  {(vramUsed / 1024).toFixed(1)} / {(vramTotal / 1024).toFixed(1)} GB ({vramPercent.toFixed(0)}%)
                </span>
              </div>
              <div className="progress-container bg-[var(--gc-surface-elevated)] h-2">
                <div 
                  className="progress-bar bg-gradient-to-r from-violet-500 to-indigo-400 shadow-sm"
                  style={{ width: `${Math.min(100, Math.max(0, vramPercent))}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)] flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-2">
              <Icon name="memory" size={14} className="text-accent" />
              <span>GPU Accelerator</span>
            </span>
            <span className="text-[11px] font-mono text-[var(--gc-text-muted)]">CPU / Unified Mode</span>
          </div>
        )}

        {/* CPU & RAM Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* CPU Metric */}
          <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)]">
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-1.5 text-[var(--gc-text)] font-medium">
                <Icon name="memory" size={14} className="text-accent" />
                <span>CPU Core Load</span>
              </div>
              <span className="text-mono font-bold text-[var(--gc-text)] text-xs">{stats.cpu_usage_percent.toFixed(1)}%</span>
            </div>
            <div className="progress-container bg-[var(--gc-surface-elevated)]">
              <div 
                className="progress-bar" 
                style={{ 
                  width: `${Math.min(100, Math.max(0, stats.cpu_usage_percent))}%`,
                  backgroundColor: getProgressColor(stats.cpu_usage_percent)
                }}
              />
            </div>
          </div>

          {/* Memory Metric */}
          <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)]">
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-1.5 text-[var(--gc-text)] font-medium">
                <Icon name="hard_drive" size={14} className="text-accent" />
                <span>RAM Usage</span>
              </div>
              <span className="text-mono font-bold text-[var(--gc-text)] text-xs">
                {(stats.used_memory_mb / 1024).toFixed(1)} / {(stats.total_memory_mb / 1024).toFixed(1)} GB
              </span>
            </div>
            <div className="progress-container bg-[var(--gc-surface-elevated)]">
              <div 
                className="progress-bar" 
                style={{ 
                  width: `${Math.min(100, Math.max(0, memPercent))}%`,
                  backgroundColor: getProgressColor(memPercent)
                }}
              />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
