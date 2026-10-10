import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  LuCpu, 
  LuHardDrive, 
  LuServer, 
  LuClock, 
  LuActivity,
  LuCircleAlert
} from 'react-icons/lu';

interface SystemStats {
  cpu_usage_percent: number;
  total_memory_mb: number;
  used_memory_mb: number;
  total_swap_mb: number;
  used_swap_mb: number;
  uptime_seconds: number;
  os_name: string;
  host_name: string;
}

export function ResourceMonitor() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchStats = async () => {
      try {
        const result = await invoke<SystemStats>('get_host_sys_stats');
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
      <div className="card glass-panel flex flex-col gap-sm" style={{ padding: '24px' }}>
        <div className="flex items-center gap-xs text-danger">
          <LuCircleAlert size={18} />
          <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Host Telemetry Unavailable</h3>
        </div>
        <p className="text-muted" style={{ fontSize: '13px' }}>{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="card glass-panel flex flex-col gap-sm items-center justify-center" style={{ padding: '32px', minHeight: '220px' }}>
        <LuActivity size={24} className="text-accent spinner" />
        <div className="text-muted" style={{ fontSize: '13px', marginTop: '8px' }}>Streaming host hardware telemetry...</div>
      </div>
    );
  }

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    return `${d > 0 ? `${d}d ` : ''}${h}h ${m}m`;
  };

  const getProgressColor = (percent: number) => {
    if (percent > 85) return 'var(--gc-danger)';
    if (percent > 70) return 'var(--gc-warning)';
    return 'var(--gc-accent)';
  };

  const memPercent = (stats.used_memory_mb / Math.max(1, stats.total_memory_mb)) * 100;

  return (
    <div className="card glass-panel flex flex-col gap-lg" style={{ padding: '24px', borderRadius: 'var(--gc-radius-lg)' }}>
      {/* Header */}
      <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--gc-border)', paddingBottom: '16px' }}>
        <div className="flex items-center gap-md">
          <div 
            className="flex items-center justify-center text-accent"
            style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: 'var(--gc-radius-md)', 
              background: 'var(--gc-accent-muted)',
              border: '1px solid var(--gc-border)'
            }}
          >
            <LuServer size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, letterSpacing: '-0.3px' }}>Remote Host Compute</h3>
            <p className="text-muted" style={{ fontSize: '12px', marginTop: '2px' }}>{stats.host_name} • {stats.os_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-xs text-muted" style={{ fontSize: '12px' }}>
          <LuClock size={13} />
          <span className="text-mono">{formatUptime(stats.uptime_seconds)}</span>
        </div>
      </div>

      {/* CPU Metric */}
      <div className="flex flex-col gap-xs">
        <div className="flex justify-between items-center" style={{ fontSize: '13px' }}>
          <div className="flex items-center gap-xs">
            <LuCpu size={15} className="text-accent" />
            <span style={{ fontWeight: 500 }}>Host CPU Utilization</span>
          </div>
          <span className="text-mono" style={{ fontWeight: 600 }}>{stats.cpu_usage_percent.toFixed(1)}%</span>
        </div>
        <div className="progress-container">
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
      <div className="flex flex-col gap-xs">
        <div className="flex justify-between items-center" style={{ fontSize: '13px' }}>
          <div className="flex items-center gap-xs">
            <LuHardDrive size={15} className="text-accent" />
            <span style={{ fontWeight: 500 }}>Host RAM Allocated</span>
          </div>
          <span className="text-mono" style={{ fontWeight: 600 }}>
            {(stats.used_memory_mb / 1024).toFixed(1)} / {(stats.total_memory_mb / 1024).toFixed(1)} GB
          </span>
        </div>
        <div className="progress-container">
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
  );
}
