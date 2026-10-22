#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let mut builder = env_logger::Builder::from_default_env();
    // mdns_sd v0.11 logs normal unregister packets at ERROR level via `error!("UnregisterResend from {}", ...)`
    builder.filter_module("mdns_sd::service_daemon", log::LevelFilter::Off);
    let _ = builder.try_init();
    ghost_compute_lib::run()
}
