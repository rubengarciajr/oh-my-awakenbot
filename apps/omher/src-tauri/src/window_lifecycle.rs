//! macOS close keeps the main WebView alive; explicit application quit still owns cleanup.

#[cfg(any(target_os = "macos", test))]
#[derive(Clone, Copy)]
enum Intent {
    Close { main_window: bool },
    Restore,
    Quit,
}

#[cfg(any(target_os = "macos", test))]
#[derive(Debug, PartialEq)]
enum Action {
    Hide,
    Restore,
    Default,
}

#[cfg(any(target_os = "macos", test))]
fn action(macos: bool, intent: Intent) -> Action {
    match (macos, intent) {
        (true, Intent::Close { main_window: true }) => Action::Hide,
        (true, Intent::Restore) => Action::Restore,
        _ => Action::Default,
    }
}

#[cfg(target_os = "macos")]
const SHOW_WINDOW: &str = "awaken-show-main-window";

/// Extend the standard menu instead of replacing native Quit, Edit, or window-manager actions.
#[cfg(target_os = "macos")]
pub(crate) fn install_menu<R: tauri::Runtime>(
    app: &tauri::App<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{MenuItem, MenuItemKind, PredefinedMenuItem, WINDOW_SUBMENU_ID};

    let menu = app.menu().ok_or("missing native application menu")?;
    let Some(MenuItemKind::Submenu(window_menu)) = menu.get(WINDOW_SUBMENU_ID) else {
        return Err("missing native Window menu".into());
    };
    window_menu.insert(
        &MenuItem::with_id(app, SHOW_WINDOW, "Show Awaken Bot", true, None::<&str>)?,
        0,
    )?;
    window_menu.insert(&PredefinedMenuItem::separator(app)?, 1)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn restore<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    use tauri::{Emitter, Manager};

    if let Some(window) = app.get_webview_window("main") {
        app.show()?;
        window.show()?;
        window.unminimize()?;
        window.emit("awaken-window-visibility", true)?;
        window.set_focus()?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn on_event<R: tauri::Runtime>(app: &tauri::AppHandle<R>, event: &tauri::RunEvent) {
    use tauri::{Emitter, Manager, RunEvent, WindowEvent};

    let intent = match event {
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { .. },
            ..
        } => Intent::Close {
            main_window: label == "main",
        },
        RunEvent::Reopen { .. } => Intent::Restore,
        RunEvent::MenuEvent(event) if event.id().as_ref() == SHOW_WINDOW => Intent::Restore,
        RunEvent::ExitRequested { .. } => Intent::Quit,
        _ => return,
    };
    match action(true, intent) {
        Action::Hide => {
            if let RunEvent::WindowEvent {
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } = event
            {
                // Prevent destruction first: a hide failure leaves a usable window and live state.
                api.prevent_close();
                if let Some(window) = app.get_webview_window("main") {
                    if let Err(error) = window.hide() {
                        eprintln!("could not hide Awaken Bot window: {error}");
                    } else if let Err(error) = window.emit("awaken-window-visibility", false) {
                        eprintln!("could not announce Awaken Bot window visibility: {error}");
                    }
                }
            }
        }
        Action::Restore => {
            if let Err(error) = restore(app) {
                eprintln!("could not restore Awaken Bot window: {error}");
            }
        }
        Action::Default => {} // Quit/restart proceeds to the existing RunEvent::Exit cleanup.
    }
}

#[cfg(test)]
mod tests {
    use super::{action, Action, Intent};

    #[test]
    fn mac_main_close_keeps_the_existing_window_warm() {
        assert_eq!(
            action(true, Intent::Close { main_window: true }),
            Action::Hide
        );
    }

    #[test]
    fn other_windows_and_other_platforms_keep_normal_close() {
        assert_eq!(
            action(true, Intent::Close { main_window: false }),
            Action::Default
        );
        assert_eq!(
            action(false, Intent::Close { main_window: true }),
            Action::Default
        );
    }

    #[test]
    fn mac_reopen_restores_the_window() {
        assert_eq!(action(true, Intent::Restore), Action::Restore);
        assert_eq!(action(false, Intent::Restore), Action::Default);
    }

    #[test]
    fn explicit_quit_keeps_application_exit_and_cleanup() {
        assert_eq!(action(true, Intent::Quit), Action::Default);
        assert_eq!(action(false, Intent::Quit), Action::Default);
    }
}
