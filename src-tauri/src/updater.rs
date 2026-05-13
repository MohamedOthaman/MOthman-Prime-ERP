use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

const CHANNEL_FILE: &str = "update_channel";

const ENDPOINT_STABLE: &str = "https://raw.githubusercontent.com/MohamedOthaman/MOthman-Prime-ERP/release-channels/channels/stable.json";
const ENDPOINT_BETA: &str = "https://raw.githubusercontent.com/MohamedOthaman/MOthman-Prime-ERP/release-channels/channels/beta.json";
const ENDPOINT_INTERNAL: &str = "https://raw.githubusercontent.com/MohamedOthaman/MOthman-Prime-ERP/release-channels/channels/internal.json";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
    pub date: Option<String>,
    pub channel: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
    pub percent: Option<f32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UpdateChannel {
    pub channel: String,
}

fn channel_file_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(CHANNEL_FILE)
}

fn read_channel(app: &AppHandle) -> String {
    let path = channel_file_path(app);
    std::fs::read_to_string(&path)
        .unwrap_or_default()
        .trim()
        .to_lowercase()
        .into()
}

fn endpoint_for_channel(channel: &str) -> &'static str {
    match channel {
        "beta" => ENDPOINT_BETA,
        "internal" => ENDPOINT_INTERNAL,
        _ => ENDPOINT_STABLE,
    }
}

#[tauri::command]
pub async fn get_update_channel(app: AppHandle) -> String {
    let ch = read_channel(&app);
    if ch.is_empty() {
        "stable".to_string()
    } else {
        ch
    }
}

#[tauri::command]
pub async fn set_update_channel(app: AppHandle, channel: String) -> Result<(), String> {
    let valid = ["stable", "beta", "internal"];
    if !valid.contains(&channel.as_str()) {
        return Err(format!("Invalid channel '{}'. Valid: stable, beta, internal", channel));
    }

    let path = channel_file_path(&app);

    // Ensure the app data directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::write(&path, &channel).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    use tauri_plugin_updater::UpdaterExt;

    let channel = read_channel(&app);
    let channel = if channel.is_empty() {
        "stable".to_string()
    } else {
        channel
    };

    let endpoint = endpoint_for_channel(&channel);

    let updater = app
        .updater_builder()
        .endpoints([endpoint])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    match updater.check().await {
        Ok(Some(update)) => Ok(Some(UpdateInfo {
            version: update.version.clone(),
            body: update.body.clone(),
            date: update.date.map(|d| d.to_rfc3339()),
            channel: channel.clone(),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;

    let channel = read_channel(&app);
    let channel = if channel.is_empty() {
        "stable".to_string()
    } else {
        channel
    };

    let endpoint = endpoint_for_channel(&channel);

    let updater = app
        .updater_builder()
        .endpoints([endpoint])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update available".to_string())?;

    let app_clone = app.clone();
    let mut total_downloaded: u64 = 0;

    update
        .download_and_install(
            move |chunk, content_length| {
                total_downloaded += chunk as u64;
                let percent = content_length.map(|total| {
                    if total > 0 {
                        (total_downloaded as f32 / total as f32 * 100.0).min(100.0)
                    } else {
                        0.0
                    }
                });

                let _ = app_clone.emit(
                    "update-download-progress",
                    DownloadProgress {
                        downloaded: total_downloaded,
                        total: content_length.map(|v| v as u64),
                        percent,
                    },
                );
            },
            || {
                // Download complete — install will begin automatically on Windows (passive mode)
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
