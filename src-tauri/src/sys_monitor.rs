use serde::Serialize;
use std::sync::Mutex;
use sysinfo::System;

lazy_static::lazy_static! {
    static ref SYS: Mutex<System> = Mutex::new(System::new_all());
}

#[derive(Serialize, Clone, Debug)]
pub struct SystemStats {
    pub cpu_usage_percent: f32,
    pub total_memory_mb: u64,
    pub used_memory_mb: u64,
    pub total_swap_mb: u64,
    pub used_swap_mb: u64,
    pub uptime_seconds: u64,
    pub os_name: String,
    pub host_name: String,
}

pub fn get_system_stats() -> SystemStats {
    let mut sys = SYS.lock().unwrap();
    
    // Refresh only what we need to minimize overhead
    sys.refresh_cpu_all();
    sys.refresh_memory();
    
    // Calculate average CPU usage across all cores
    let cpus = sys.cpus();
    let cpu_usage_percent = if !cpus.is_empty() {
        let sum: f32 = cpus.iter().map(|c| c.cpu_usage()).sum();
        sum / (cpus.len() as f32)
    } else {
        0.0
    };

    SystemStats {
        cpu_usage_percent,
        total_memory_mb: sys.total_memory() / 1024 / 1024,
        used_memory_mb: sys.used_memory() / 1024 / 1024,
        total_swap_mb: sys.total_swap() / 1024 / 1024,
        used_swap_mb: sys.used_swap() / 1024 / 1024,
        uptime_seconds: System::uptime(),
        os_name: System::long_os_version().unwrap_or_else(|| "Unknown OS".to_string()),
        host_name: System::host_name().unwrap_or_else(|| "GhostNode".to_string()),
    }
}
