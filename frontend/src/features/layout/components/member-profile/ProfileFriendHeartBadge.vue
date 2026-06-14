<script setup lang="ts">
const props = defineProps<{
  size?: 'sm' | 'md';
}>();
</script>

<template>
  <span
    class="profile-friend-heart"
    :class="
      props.size === 'md'
        ? 'profile-friend-heart--md'
        : 'profile-friend-heart--sm'
    "
    role="img"
    aria-label="Friends"
    title="Friends"
  >
    <span class="profile-friend-heart__glint" aria-hidden="true" />
    <span class="profile-friend-heart__rim" aria-hidden="true" />
    <svg
      class="profile-friend-heart__icon"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d="M12 20.5c-.35 0-.7-.12-.98-.35C8.2 17.77 4.5 14.4 4.5 10.75A4.25 4.25 0 0 1 8.75 6.5c1.42 0 2.73.69 3.5 1.79A4.23 4.23 0 0 1 19.5 10.75c0 3.65-3.7 7.02-6.52 9.4-.28.23-.63.35-.98.35Z"
      />
    </svg>
  </span>
</template>

<style scoped>
.profile-friend-heart {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  isolation: isolate;
  border-radius: 999px;
  padding: 0.125rem 0.45rem 0.14rem;
  min-height: 1.28rem;
  min-width: 1.85rem;
  background: linear-gradient(
    145deg,
    #2a0608 0%,
    #6b0f16 22%,
    #b91c2c 48%,
    #f43f5e 56%,
    #c81e2d 74%,
    #3f0609 100%
  );
  color: #fff5f7;
  box-shadow: none;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.profile-friend-heart:hover {
  transform: translateY(-1px) scale(1.03);
  box-shadow: none;
}

.profile-friend-heart:active {
  transform: translateY(0) scale(0.99);
}

.profile-friend-heart--md {
  min-height: 1.48rem;
  min-width: 2.05rem;
  padding: 0.14rem 0.5rem 0.16rem;
}

.profile-friend-heart__glint {
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(255, 236, 240, 0.52) 0%,
    rgba(255, 182, 193, 0.18) 40%,
    rgba(255, 255, 255, 0) 58%
  );
  opacity: 0.85;
}

.profile-friend-heart__rim {
  position: absolute;
  inset: 2px;
  border-radius: inherit;
  z-index: 0;
  pointer-events: none;
  box-shadow:
    inset 0 0 0 1px rgba(255, 210, 218, 0.22),
    inset 0 -1px 2px rgba(24, 4, 8, 0.48);
}

[data-theme='light'] .profile-friend-heart__rim {
  box-shadow: none;
}

.profile-friend-heart__icon {
  position: relative;
  z-index: 1;
  width: 0.72rem;
  height: 0.72rem;
  display: block;
  filter: drop-shadow(0 1px 0 rgba(40, 4, 10, 0.55))
    drop-shadow(0 0 8px rgba(255, 182, 198, 0.45));
}

.profile-friend-heart--md .profile-friend-heart__icon {
  width: 0.8rem;
  height: 0.8rem;
}

@media (prefers-reduced-motion: reduce) {
  .profile-friend-heart {
    transition: none;
  }
  .profile-friend-heart:hover {
    transform: none;
  }
}
</style>
