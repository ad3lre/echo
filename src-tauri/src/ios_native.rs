use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum IosHapticKind {
    Selection,
    Light,
    Medium,
    Heavy,
    Success,
    Warning,
    Error,
}

impl Default for IosHapticKind {
    fn default() -> Self {
        Self::Light
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IosHapticResult {
    performed: bool,
}

#[tauri::command]
pub fn ios_native_haptic(kind: Option<IosHapticKind>) -> IosHapticResult {
    IosHapticResult {
        performed: platform::haptic(kind.unwrap_or_default()),
    }
}

/// Whether the app is running inside the iOS Simulator (vs a physical device).
///
/// The Simulator injects `SIMULATOR_UDID` (and other `SIMULATOR_*` vars) into
/// every hosted process' environment; physical devices do not. The frontend uses
/// this to skip Web Audio priming on the Simulator, whose CoreAudio HAL frequently
/// times out starting an `AURemoteIO` and aborts WebKit's GPU process
/// (`AudioOutputUnitAdaptor::start()` → `_ReportRPCTimeout`). Real devices are
/// unaffected, so this is gated to the Simulator only and never changes device behavior.
#[tauri::command]
pub fn ios_is_simulator() -> bool {
    cfg!(target_os = "ios") && std::env::var_os("SIMULATOR_UDID").is_some()
}

#[cfg(target_os = "ios")]
mod platform {
    use super::IosHapticKind;
    use objc2::MainThreadMarker;
    use objc2_ui_kit::{
        UIImpactFeedbackGenerator, UIImpactFeedbackStyle, UINotificationFeedbackGenerator,
        UINotificationFeedbackType, UISelectionFeedbackGenerator,
    };

    pub fn haptic(kind: IosHapticKind) -> bool {
        let Some(mtm) = MainThreadMarker::new() else {
            return false;
        };

        match kind {
            IosHapticKind::Selection => {
                UISelectionFeedbackGenerator::new(mtm).selectionChanged();
            }
            IosHapticKind::Success => {
                UINotificationFeedbackGenerator::new(mtm)
                    .notificationOccurred(UINotificationFeedbackType::Success);
            }
            IosHapticKind::Warning => {
                UINotificationFeedbackGenerator::new(mtm)
                    .notificationOccurred(UINotificationFeedbackType::Warning);
            }
            IosHapticKind::Error => {
                UINotificationFeedbackGenerator::new(mtm)
                    .notificationOccurred(UINotificationFeedbackType::Error);
            }
            IosHapticKind::Light => {
                impact(mtm, UIImpactFeedbackStyle::Light);
            }
            IosHapticKind::Medium => {
                impact(mtm, UIImpactFeedbackStyle::Medium);
            }
            IosHapticKind::Heavy => {
                impact(mtm, UIImpactFeedbackStyle::Heavy);
            }
        }

        true
    }

    fn impact(mtm: MainThreadMarker, style: UIImpactFeedbackStyle) {
        #[allow(deprecated)]
        UIImpactFeedbackGenerator::initWithStyle(mtm.alloc::<UIImpactFeedbackGenerator>(), style)
            .impactOccurred();
    }
}

#[cfg(not(target_os = "ios"))]
mod platform {
    use super::IosHapticKind;

    pub fn haptic(_kind: IosHapticKind) -> bool {
        false
    }
}
