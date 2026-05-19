use rodio::{Decoder, OutputStream, Sink, Source};
use serde::Serialize;
use std::io::Cursor;
use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;
use std::thread;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAudioDevice {
  pub id: String,
  pub name: String,
  pub is_default: bool,
}

#[derive(Default)]
struct DesktopAudioPrefs {
  output_device_id: Option<String>,
  input_device_id: Option<String>,
  output_volume: f32,
}

pub struct DesktopAudioState {
  prefs: Mutex<DesktopAudioPrefs>,
  command_tx: Sender<DesktopAudioCommand>,
}

impl DesktopAudioState {
  pub fn set_output_device_id(&self, output_device_id: Option<String>) {
    if let Ok(mut prefs) = self.prefs.lock() {
      prefs.output_device_id = output_device_id;
    }
  }

  pub fn get_output_device_id(&self) -> Option<String> {
    self
      .prefs
      .lock()
      .ok()
      .and_then(|prefs| prefs.output_device_id.clone())
  }

  pub fn set_input_device_id(&self, input_device_id: Option<String>) {
    if let Ok(mut prefs) = self.prefs.lock() {
      prefs.input_device_id = input_device_id;
    }
  }

  pub fn get_input_device_id(&self) -> Option<String> {
    self
      .prefs
      .lock()
      .ok()
      .and_then(|prefs| prefs.input_device_id.clone())
  }

  pub fn set_output_volume(&self, output_volume: f32) {
    let volume = output_volume.clamp(0.0, 6.0);
    if let Ok(mut prefs) = self.prefs.lock() {
      prefs.output_volume = volume;
    }
  }

  pub fn output_volume(&self) -> f32 {
    self
      .prefs
      .lock()
      .ok()
      .map(|prefs| {
        if prefs.output_volume <= 0.0 {
          1.0
        } else {
          prefs.output_volume
        }
      })
      .unwrap_or(1.0)
  }

  pub fn stop_ringtone(&self) {
    let _ = self.command_tx.send(DesktopAudioCommand::Stop);
  }

  pub fn play_ringtone(
    &self,
    audio_bytes: Vec<u8>,
    looped: bool,
    volume: Option<f32>,
  ) -> Result<(), String> {
    let selected_device_id = self.get_output_device_id();
    let base_volume = volume.unwrap_or_else(|| self.output_volume()).clamp(0.0, 1.0);
    self
      .command_tx
      .send(DesktopAudioCommand::Play {
        audio_bytes,
        looped,
        volume: base_volume,
        device_id: selected_device_id,
      })
      .map_err(|e| format!("queue ringtone playback failed: {e}"))
  }
}

enum DesktopAudioCommand {
  Play {
    audio_bytes: Vec<u8>,
    looped: bool,
    volume: f32,
    device_id: Option<String>,
  },
  Stop,
}

impl Default for DesktopAudioState {
  fn default() -> Self {
    let (tx, rx) = mpsc::channel::<DesktopAudioCommand>();
    thread::spawn(move || {
      let mut active_playback: Option<(OutputStream, Sink)> = None;
      while let Ok(cmd) = rx.recv() {
        match cmd {
          DesktopAudioCommand::Stop => {
            if let Some((_, sink)) = active_playback.take() {
              sink.stop();
            }
          }
          DesktopAudioCommand::Play {
            audio_bytes,
            looped,
            volume,
            device_id,
          } => {
            if let Some((_, sink)) = active_playback.take() {
              sink.stop();
            }
            let (stream, handle) = match output_stream_for_device(device_id.as_deref()) {
              Ok(v) => v,
              Err(_) => continue,
            };
            let sink = match Sink::try_new(&handle) {
              Ok(s) => s,
              Err(_) => continue,
            };
            let source = match Decoder::new(Cursor::new(audio_bytes)) {
              Ok(s) => s,
              Err(_) => continue,
            };
            sink.set_volume(volume.clamp(0.0, 1.0));
            if looped {
              sink.append(source.repeat_infinite());
            } else {
              sink.append(source);
            }
            sink.play();
            active_playback = Some((stream, sink));
          }
        }
      }
    });

    Self {
      prefs: Mutex::new(DesktopAudioPrefs {
        output_device_id: None,
        input_device_id: None,
        output_volume: 1.0,
      }),
      command_tx: tx,
    }
  }
}

pub fn list_output_devices() -> Vec<DesktopAudioDevice> {
  use cpal::traits::{DeviceTrait, HostTrait};
  let host = cpal::default_host();
  let default_name = host.default_output_device().and_then(|d| d.name().ok());
  host
    .output_devices()
    .ok()
    .map(|iter| {
      iter
        .enumerate()
        .map(|(idx, d)| {
          let name = d.name().unwrap_or_else(|_| format!("Output {}", idx + 1));
          let id = normalize_device_id(&name, idx);
          DesktopAudioDevice {
            id,
            name: name.clone(),
            is_default: default_name
              .as_ref()
              .map(|n| n == &name)
              .unwrap_or(false),
          }
        })
        .collect()
    })
    .unwrap_or_default()
}

pub fn list_input_devices() -> Vec<DesktopAudioDevice> {
  use cpal::traits::{DeviceTrait, HostTrait};
  let host = cpal::default_host();
  let default_name = host.default_input_device().and_then(|d| d.name().ok());
  host
    .input_devices()
    .ok()
    .map(|iter| {
      iter
        .enumerate()
        .map(|(idx, d)| {
          let name = d.name().unwrap_or_else(|_| format!("Input {}", idx + 1));
          let id = normalize_device_id(&name, idx);
          DesktopAudioDevice {
            id,
            name: name.clone(),
            is_default: default_name
              .as_ref()
              .map(|n| n == &name)
              .unwrap_or(false),
          }
        })
        .collect()
    })
    .unwrap_or_default()
}

fn normalize_device_id(name: &str, idx: usize) -> String {
  format!(
    "{}:{}",
    idx,
    name
      .chars()
      .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
      .collect::<String>()
      .to_ascii_lowercase()
  )
}

fn find_output_device_by_id(id: &str) -> Option<cpal::Device> {
  use cpal::traits::{DeviceTrait, HostTrait};
  let host = cpal::default_host();
  host
    .output_devices()
    .ok()?
    .enumerate()
    .find_map(|(idx, device)| {
      let name = device.name().ok()?;
      if normalize_device_id(&name, idx) == id {
        Some(device)
      } else {
        None
      }
    })
}

fn output_stream_for_device(
  selected_id: Option<&str>,
) -> Result<(OutputStream, rodio::OutputStreamHandle), String> {
  if let Some(id) = selected_id {
    if !id.trim().is_empty() && id.trim() != "default" {
      if let Some(device) = find_output_device_by_id(id.trim()) {
        return OutputStream::try_from_device(&device)
          .map_err(|e| format!("failed to open selected output device: {e}"));
      }
    }
  }
  OutputStream::try_default().map_err(|e| format!("default output stream unavailable: {e}"))
}
