<template>
  <div
    class="message-list-older-fetch-header flex items-center justify-center gap-2 py-3"
    aria-hidden="true"
  >
    <svg
      class="echo-ios-spinner message-list-older-fetch-header__spinner"
      viewBox="0 0 44 44"
      aria-hidden="true"
    >
      <circle class="echo-ios-spinner__track" cx="22" cy="22" r="18" />
      <circle class="echo-ios-spinner__arc" cx="22" cy="22" r="18" />
    </svg>
    <span class="text-xs font-medium text-muted">Loading older messages</span>
  </div>
</template>

<style scoped lang="scss">
.message-list-older-fetch-header__spinner {
  width: 18px;
  height: 18px;
}
</style>
