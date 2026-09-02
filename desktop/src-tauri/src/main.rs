// Prevents an extra console window on Windows; harmless on the Mac.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    docket_desktop_lib::run()
}
