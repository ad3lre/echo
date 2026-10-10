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

<style scoped src="./styles/ProfileFriendHeartBadge.scss"></style>
