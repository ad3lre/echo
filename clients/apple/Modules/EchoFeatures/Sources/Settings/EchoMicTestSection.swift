import SwiftUI

/// Voice settings → mic test (web `useMicTestMonitor` in `SettingsVoiceVideo`).
struct EchoMicTestSection: View {
  let outputVolume: Double
  @State private var model = EchoMicTestModel()

  var body: some View {
    @Bindable var model = model
    VStack(alignment: .leading, spacing: 0) {
      EchoSettingAction(
        title: EchoCopy.string(model.isRunning ? "Stop mic test" : "Test microphone"),
        subtitle: EchoCopy.string(
          model.isRunning ? "Speak to see your input level" : "Check your input level"),
        icon: model.isRunning ? "stop.circle.fill" : "mic.badge.plus", tint: .green
      ) { Task { await model.toggle() } }
      if model.isRunning {
        levelMeter(model.level)
        EchoSettingToggle(
          title: EchoCopy.string("Hear yourself"),
          subtitle: EchoCopy.string("Play your mic back through the output. Use headphones."),
          icon: "headphones", tint: .teal, isOn: $model.loopback)
      }
      if let error = model.errorMessage {
        Text(error)
          .font(.system(size: 12, weight: .medium, design: .rounded))
          .foregroundStyle(.red.opacity(0.85))
          .padding(.vertical, 8)
      }
    }
    .onAppear { model.outputVolume = outputVolume }
    .onChange(of: outputVolume) { _, value in model.outputVolume = value }
    .onDisappear { model.stop() }
  }

  private func levelMeter(_ level: Double) -> some View {
    GeometryReader { proxy in
      ZStack(alignment: .leading) {
        Capsule().fill(EchoTheme.Color.ink(0.08))
        Capsule()
          .fill(level > 0.85 ? Color.red : (level > 0.6 ? Color.orange : Color.green))
          .frame(width: max(6, proxy.size.width * level))
      }
    }
    .frame(height: 8)
    .padding(.vertical, 12)
    .animation(.linear(duration: 0.08), value: level)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(EchoCopy.string("Microphone level"))
    .accessibilityValue("\(Int(level * 100))%")
  }
}
