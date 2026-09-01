use std::env;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

pub async fn ensure_cloudflared(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let local_data_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get app local data dir: {}", e))?;

    if !local_data_dir.exists() {
        fs::create_dir_all(&local_data_dir)
            .map_err(|e| format!("Failed to create local data dir: {}", e))?;
    }

    let os = env::consts::OS;
    let arch = env::consts::ARCH;

    // Default binary name inside our data dir
    let binary_name = if os == "windows" {
        "cloudflared.exe"
    } else {
        "cloudflared"
    };

    let binary_path = local_data_dir.join(binary_name);

    if binary_path.exists() {
        return Ok(binary_path);
    }

    log::info!(
        "Cloudflared binary not found locally. Downloading for {}/{}...",
        os,
        arch
    );

    let download_url = match (os, arch) {
        ("windows", "x86_64") => "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe",
        ("windows", "x86") => "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-386.exe",
        ("linux", "x86_64") => "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
        ("linux", "aarch64") => "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64",
        ("macos", "x86_64") => "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz",
        ("macos", "aarch64") => "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz",
        _ => return Err(format!("Unsupported OS/architecture combination: {}/{}", os, arch)),
    };

    let response = reqwest::get(download_url)
        .await
        .map_err(|e| format!("Failed to fetch cloudflared release: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download cloudflared: HTTP {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download body: {}", e))?;

    if download_url.ends_with(".tgz") {
        #[cfg(unix)]
        {
            use flate2::read::GzDecoder;
            use std::io::Cursor;
            use tar::Archive;

            let tar = GzDecoder::new(Cursor::new(bytes));
            let mut archive = Archive::new(tar);

            // Extract the 'cloudflared' binary directly to our target path
            for file in archive
                .entries()
                .map_err(|e| format!("Failed to read tar entries: {}", e))?
            {
                let mut file = file.map_err(|e| format!("Failed to read tar entry: {}", e))?;
                let path = file
                    .path()
                    .map_err(|e| format!("Failed to read tar path: {}", e))?;

                if path.to_string_lossy().contains("cloudflared") {
                    let mut out = fs::File::create(&binary_path)
                        .map_err(|e| format!("Failed to create extracted file: {}", e))?;
                    std::io::copy(&mut file, &mut out)
                        .map_err(|e| format!("Failed to write extracted file: {}", e))?;
                    break;
                }
            }
        }
    } else {
        fs::write(&binary_path, &bytes)
            .map_err(|e| format!("Failed to write binary file: {}", e))?;
    }

    #[cfg(unix)]
    {
        // Make it executable
        let mut perms = fs::metadata(&binary_path)
            .map_err(|e| format!("Failed to read metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&binary_path, perms)
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    log::info!(
        "Cloudflared binary successfully downloaded to {:?}",
        binary_path
    );
    Ok(binary_path)
}
