// Food Choice ERP — Tauri desktop entry point.
//
// Registers the SQL plugin (used by the offline-first local database layer),
// the dialog/fs plugins (used for native save and barcode CSV import), and
// builds the main window.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running Food Choice ERP desktop application");
}