// The Mac app is a thin shell: the live site in a webview, plus the two
// things a browser cannot do. Dropped files arrive with real paths
// (Tauri's drag-drop event), and this command maps a path on a mounted
// share back to the smb:// or afp:// URL the office uses, by reading the
// mount table. Paths off a share come back unchanged.

/// Maps `/Volumes/CLIENTS/Hills Bank/x` to `smb://oven/CLIENTS/Hills Bank/x`
/// using the mount table text (the output of `mount`).
pub fn share_url_from_mounts(mounts: &str, path: &str) -> String {
    let mut best: Option<(String, String)> = None;
    for line in mounts.lines() {
        // //user@host/share on /Volumes/NAME (smbfs, nodev, ...)
        let Some((device, rest)) = line.split_once(" on ") else { continue };
        let Some((mount_point, kind)) = rest.rsplit_once(" (") else { continue };
        let scheme = if kind.starts_with("smbfs") {
            "smb"
        } else if kind.starts_with("afpfs") {
            "afp"
        } else {
            continue;
        };
        let device = device.trim_start_matches("//");
        let host_and_share = device.rsplit_once('@').map_or(device, |(_, h)| h);
        let under = path == mount_point || path.starts_with(&format!("{mount_point}/"));
        if !under {
            continue;
        }
        let longer = best.as_ref().map_or(true, |(mp, _)| mount_point.len() > mp.len());
        if longer {
            best = Some((mount_point.to_string(), format!("{scheme}://{host_and_share}")));
        }
    }
    match best {
        Some((mount_point, url)) => format!("{url}{}", &path[mount_point.len()..]),
        None => path.to_string(),
    }
}

#[tauri::command]
fn share_url(path: String) -> String {
    let mounts = std::process::Command::new("mount")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default();
    share_url_from_mounts(&mounts, &path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![share_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::share_url_from_mounts;

    const MOUNTS: &str = "/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)\n\
//Luke%20David@OVEN._smb._tcp.local/CLIENTS on /Volumes/CLIENTS (smbfs, nodev, nosuid, mounted by lukedavid)\n\
//Luke%20David@OVEN._smb._tcp.local/WEB on /Volumes/WEB (smbfs, nodev, nosuid, mounted by lukedavid)\n";

    #[test]
    fn maps_a_share_path() {
        assert_eq!(
            share_url_from_mounts(MOUNTS, "/Volumes/WEB/Heritage Works"),
            "smb://OVEN._smb._tcp.local/WEB/Heritage Works"
        );
        assert_eq!(
            share_url_from_mounts(MOUNTS, "/Volumes/CLIENTS/Hills Bank/Spring mailer/logo.ai"),
            "smb://OVEN._smb._tcp.local/CLIENTS/Hills Bank/Spring mailer/logo.ai"
        );
    }

    #[test]
    fn leaves_other_paths_alone() {
        assert_eq!(share_url_from_mounts(MOUNTS, "/Users/luke/Desktop/x.png"), "/Users/luke/Desktop/x.png");
        assert_eq!(share_url_from_mounts(MOUNTS, "/Volumes/CLIENTSX/y"), "/Volumes/CLIENTSX/y");
    }
}
