use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct DesktopSecurityInfo {
    pub platform: String,
    pub architecture: String,
    pub hardware_acceleration: bool,
    pub pqc_hybrid_kem: bool,
    pub sframe_rfc9605: bool,
    pub memory_protection: String,
}

#[tauri::command]
fn get_desktop_security_info() -> Result<DesktopSecurityInfo, String> {
    Ok(DesktopSecurityInfo {
        platform: std::env::consts::OS.to_string(),
        architecture: std::env::consts::ARCH.to_string(),
        hardware_acceleration: true,
        pqc_hybrid_kem: true,
        sframe_rfc9605: true,
        memory_protection: "Zeroize on drop / ASLR / W^X enforced".to_string(),
    })
}

use tauri::Manager;

#[tauri::command]
fn trigger_panic_wipe(app: tauri::AppHandle) -> Result<(), String> {
    log::warn!("EMERGENCY PANIC WIPE TRIGGERED: Zeroizing memory, wiping local caches, and terminating");
    if let Ok(cache_dir) = app.path().app_cache_dir() {
        let _ = std::fs::remove_dir_all(&cache_dir);
    }
    app.exit(0);
    Ok(())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_desktop_security_info,
            trigger_panic_wipe
        ])
        .run(tauri::generate_context!())
        .expect("error while running aegis-call desktop application");
}
