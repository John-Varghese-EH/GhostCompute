import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

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
        <h3 className="text-xl">Host Resources</h3>
        <p className="text-danger">Failed to fetch stats: {error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="card glass-panel flex flex-col gap-sm items-center justify-center" style={{ padding: '24px', minHeight: '200px' }}>
        <div className="text-muted">Loading host telemetry...</div>
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
    <div className="card glass-panel flex flex-col gap-md" style={{ padding: '24px' }}>
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg">Host Telemetry</h3>
          <p className="text-sm text-dim">{stats.host_name} • {stats.os_name}</p>
        </div>
        <div className="badge badge-success text-mono">{formatUptime(stats.uptime_seconds)}</div>
      </div>

      <div className="flex flex-col gap-sm" style={{ marginTop: '8px' }}>
        <div className="flex justify-between items-center text-sm">
          <span>CPU Usage</span>
          <span className="text-mono">{stats.cpu_usage_percent.toFixed(1)}%</span>
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

      <div className="flex flex-col gap-sm">
        <div className="flex justify-between items-center text-sm">
          <span>Memory Usage</span>
          <span className="text-mono">
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
