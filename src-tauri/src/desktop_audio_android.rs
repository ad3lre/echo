//! No-op audio surface for mobile (Android / iOS MVP). Desktop uses `desktop_audio_desktop.rs`.

use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAudioDevice {
  pub id: String,
  pub name: String,
  pub is_default: bool,
}

#[derive(Default)]
pub struct DesktopAudioState;

impl DesktopAudioState {
  pub fn set_output_device_id(&self, _output_device_id: Option<String>) {}

  pub fn get_output_device_id(&self) -> Option<String> {
    None
  }

  pub fn set_input_device_id(&self, _input_device_id: Option<String>) {}

  pub fn get_input_device_id(&self) -> Option<String> {
    None
  }

  pub fn set_output_volume(&self, _output_volume: f32) {}

  pub fn play_ringtone(
    &self,
    _audio_bytes: Vec<u8>,
    _looped: bool,
    _volume: Option<f32>,
  ) -> Result<(), String> {
    Ok(())
  }

  pub fn stop_ringtone(&self) {}
}

pub fn list_output_devices() -> Vec<DesktopAudioDevice> {
  vec![]
}

pub fn list_input_devices() -> Vec<DesktopAudioDevice> {
  vec![]
}
