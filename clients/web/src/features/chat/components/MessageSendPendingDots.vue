<template>
  <span
    class="message-send-pending-dots inline-flex gap-0.5 align-middle"
    role="status"
    aria-label="Sending"
  >
    <span class="dot" aria-hidden="true" />
    <span class="dot" aria-hidden="true" />
    <span class="dot" aria-hidden="true" />
  </span>
</template>

<style scoped lang="scss">
.message-send-pending-dots .dot {
  width: 4px;
  height: 4px;
  border-radius: 9999px;
  background: var(--muted);
  opacity: 0.35;
  animation: message-send-pending-bounce 1.2s ease-in-out infinite;
}
.message-send-pending-dots .dot:nth-child(2) {
  animation-delay: 0.15s;
}
.message-send-pending-dots .dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes message-send-pending-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  30% {
    transform: translateY(-3px);
    opacity: 0.95;
  }
}
</style>
