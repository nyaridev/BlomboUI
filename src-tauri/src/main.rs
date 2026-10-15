//! BlomboUI desktop window.
//!
//! A thin native shell around the local BlomboUI server (ADR-0002): the Node server
//! (`src/server/main.ts --open app`) starts first, then launches this binary with
//! `--url http://127.0.0.1:4380 --data-dir <repo>/runtime/app`. Closing the main window stops
//! the server.
//!
//! BlomboUI runs from its folder and has no installer, so nothing goes to AppData: the WebView2
//! profile (cache, local storage) and the remembered window size live in `--data-dir`.
//!
//! The page is the same web app the browser gets. A capability grants it Tauri IPC on
//! localhost so it can open extra windows (the ComfyUI editor) through `@tauri-apps/api`.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::webview::DownloadEvent;
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

const DEFAULT_URL: &str = "http://127.0.0.1:4380";

fn arg_value(name: &str) -> Option<String> {
    let mut args = std::env::args().skip_while(|arg| arg != name);
    args.nth(1)
}

/// `--data-dir`, or `runtime/app` of the checkout this binary was built in
/// (`<repo>/src-tauri/target/<profile>/blombo-ui.exe`), or a folder next to the binary.
fn data_dir() -> PathBuf {
    if let Some(dir) = arg_value("--data-dir") {
        return PathBuf::from(dir);
    }
    let exe = std::env::current_exe().unwrap_or_default();
    let exe_dir = exe.parent().map(Path::to_path_buf).unwrap_or_default();
    let repo = exe_dir.ancestors().nth(3).map(Path::to_path_buf);
    match repo {
        Some(root) if root.join("package.json").exists() => root.join("runtime").join("app"),
        _ => exe_dir.join("blombo-data"),
    }
}

/// The main window's last normal (not maximized) placement, in physical pixels.
#[derive(Serialize, Deserialize, Clone, Copy)]
struct Placement {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

fn load_placement(file: &Path) -> Option<Placement> {
    serde_json::from_str(&std::fs::read_to_string(file).ok()?).ok()
}

fn save_placement(file: &Path, placement: Placement) {
    if let Ok(json) = serde_json::to_string_pretty(&placement) {
        let tmp = file.with_extension("json.tmp");
        if std::fs::write(&tmp, json).is_ok() {
            let _ = std::fs::rename(&tmp, file);
        }
    }
}

/// Remembered between move/resize events and written when the window closes.
struct Remembered {
    file: PathBuf,
    placement: Mutex<Option<Placement>>,
}

/// Note the window's placement. A maximized window keeps its normal size for when it's
/// restored; a minimized one isn't recorded (Windows parks it off-screen).
fn remember(window: &tauri::Window) {
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    let remembered = window.state::<Remembered>();
    let mut slot = remembered.placement.lock().unwrap();
    if window.is_maximized().unwrap_or(false) {
        if let Some(p) = slot.as_mut() {
            p.maximized = true;
        }
        return;
    }
    if let (Ok(pos), Ok(size)) = (window.outer_position(), window.inner_size()) {
        *slot = Some(Placement {
            x: pos.x,
            y: pos.y,
            width: size.width,
            height: size.height,
            maximized: false,
        });
    }
}

fn main() {
    let url = arg_value("--url").unwrap_or_else(|| DEFAULT_URL.to_string());
    let data = data_dir();
    let _ = std::fs::create_dir_all(&data);
    let state_file = data.join("window.json");

    tauri::Builder::default()
        .manage(Remembered {
            file: state_file.clone(),
            placement: Mutex::new(load_placement(&state_file)),
        })
        .setup(move |app| {
            let target = url.parse().expect("--url must be a valid http URL");
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(target))
                .title("BlomboUI")
                .inner_size(1600.0, 980.0)
                .min_inner_size(1180.0, 720.0)
                .visible(false)
                .theme(Some(tauri::Theme::Dark))
                .data_directory(data.join("webview"))
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

            // Put the window back where it was, if that spot is still on a screen; else center it.
            // (Centering in the builder would override the restored position.)
            let saved = *app.state::<Remembered>().placement.lock().unwrap();
            let monitors = window.available_monitors().unwrap_or_default();
            let restored = saved.filter(|p| {
                // The title bar's left part must be visible to drag the window.
                let (tx, ty) = (p.x + 80, p.y + 16);
                p.width >= 600
                    && p.height >= 400
                    && monitors.iter().any(|m| {
                        let (mx, my) = (m.position().x, m.position().y);
                        let (mw, mh) = (m.size().width as i32, m.size().height as i32);
                        tx >= mx && tx < mx + mw && ty >= my && ty < my + mh
                    })
            });
            match restored {
                Some(p) => {
                    let _ = window.set_size(PhysicalSize::new(p.width, p.height));
                    let _ = window.set_position(PhysicalPosition::new(p.x, p.y));
                }
                None => {
                    let _ = window.center();
                }
            }
            if saved.is_some_and(|p| p.maximized) {
                let _ = window.maximize();
            }
            let _ = window.show();
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                    remember(window);
                }
                tauri::WindowEvent::CloseRequested { .. } => {
                    remember(window);
                    let remembered = window.state::<Remembered>();
                    let slot = *remembered.placement.lock().unwrap();
                    if let Some(p) = slot {
                        save_placement(&remembered.file, p);
                    }
                }
                // Secondary windows (ComfyUI editor) close on their own; the main window ends the app.
                tauri::WindowEvent::Destroyed => window.app_handle().exit(0),
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running BlomboUI");
}
