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
