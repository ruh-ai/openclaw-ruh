use serde::{Deserialize, Serialize};
use tauri_plugin_store::StoreExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct Credentials {
    pub access_token: String,
    pub refresh_token: String,
}

const STORE_FILE: &str = "credentials.json";
const ACCESS_KEY: &str = "access_token";
const REFRESH_KEY: &str = "refresh_token";

#[tauri::command]
pub fn store_credentials(
    app: tauri::AppHandle,
    access_token: String,
    refresh_token: String,
) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(ACCESS_KEY, serde_json::json!(access_token));
    store.set(REFRESH_KEY, serde_json::json!(refresh_token));
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_credentials(app: tauri::AppHandle) -> Result<Option<Credentials>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let access = store.get(ACCESS_KEY);
    let refresh = store.get(REFRESH_KEY);
    match (access, refresh) {
        (Some(a), Some(r)) => Ok(Some(Credentials {
            access_token: a.as_str().unwrap_or_default().to_string(),
            refresh_token: r.as_str().unwrap_or_default().to_string(),
        })),
        _ => Ok(None),
    }
}

#[tauri::command]
pub fn clear_credentials(app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.delete(ACCESS_KEY);
    store.delete(REFRESH_KEY);
    store.save().map_err(|e| e.to_string())
}
