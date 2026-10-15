//! BlomboUI desktop window.
//!
//! A thin native shell around the local BlomboUI server (ADR-0002): the Node server
//! (`src/server/main.ts --open app`) starts first, then launches this binary with
//! `--url http://127.0.0.1:4380`. Closing the main window stops the server.
//!
//! The page is the same web app the browser gets. A capability grants it Tauri IPC on
//! localhost so it can open extra windows (the ComfyUI editor) through `@tauri-apps/api`.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::webview::DownloadEvent;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const DEFAULT_URL: &str = "http://127.0.0.1:4380";

fn url_from_args() -> String {
    let mut args = std::env::args().skip_while(|arg| arg != "--url");
    args.nth(1).unwrap_or_else(|| DEFAULT_URL.to_string())
}

fn main() {
    let url = url_from_args();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(move |app| {
            let target = url.parse().expect("--url must be a valid http URL");
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(target))
                .title("BlomboUI")
                .inner_size(1600.0, 980.0)
                .min_inner_size(1180.0, 720.0)
                .center()
                .theme(Some(tauri::Theme::Dark))
                // Image downloads and exports land in the user's Downloads folder.
                .on_download(|webview, event| {
                    if let DownloadEvent::Requested { destination, .. } = event {
                        if let (Ok(dir), Some(name)) =
                            (webview.path().download_dir(), destination.file_name())
                        {
                            *destination = dir.join(name);
                        }
                    }
                    true
                })
                .build()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Secondary windows (ComfyUI editor) close on their own; the main window ends the app.
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running BlomboUI");
}
