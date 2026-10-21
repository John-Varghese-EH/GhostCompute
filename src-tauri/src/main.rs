#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let _ = env_logger::try_init();
    ghost_compute_lib::run()
}
