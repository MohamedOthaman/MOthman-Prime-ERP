mod updater;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            updater::check_update,
            updater::install_update,
            updater::get_update_channel,
            updater::set_update_channel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Food Choice ERP desktop application");
}