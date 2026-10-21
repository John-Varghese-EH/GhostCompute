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
    pub gpu_name: Option<String>,
    pub gpu_vram_total_mb: Option<u64>,
    pub gpu_vram_used_mb: Option<u64>,
    pub gpu_temp_celsius: Option<u32>,
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

    let gpu_info = probe_nvidia_gpu_metrics();

    SystemStats {
        cpu_usage_percent,
        total_memory_mb: sys.total_memory() / 1024 / 1024,
        used_memory_mb: sys.used_memory() / 1024 / 1024,
        total_swap_mb: sys.total_swap() / 1024 / 1024,
        used_swap_mb: sys.used_swap() / 1024 / 1024,
        uptime_seconds: System::uptime(),
        os_name: System::long_os_version().unwrap_or_else(|| "Unknown OS".to_string()),
        host_name: System::host_name().unwrap_or_else(|| "GhostNode".to_string()),
        gpu_name: gpu_info.0,
        gpu_vram_total_mb: gpu_info.1,
        gpu_vram_used_mb: gpu_info.2,
        gpu_temp_celsius: gpu_info.3,
    }
}

fn probe_nvidia_gpu_metrics() -> (Option<String>, Option<u64>, Option<u64>, Option<u32>) {
    use std::process::Command;
    if let Ok(output) = Command::new("nvidia-smi")
        .args(["--query-gpu=name,memory.total,memory.used,temperature.gpu", "--format=csv,noheader,nounits"])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(line) = stdout.lines().next() {
                let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
                let name = parts.first().map(|s| s.to_string());
                let total = parts.get(1).and_then(|s| s.parse::<u64>().ok());
                let used = parts.get(2).and_then(|s| s.parse::<u64>().ok());
                let temp = parts.get(3).and_then(|s| s.parse::<u32>().ok());
                return (name, total, used, temp);
            }
        }
    }
    (None, None, None, None)
}
