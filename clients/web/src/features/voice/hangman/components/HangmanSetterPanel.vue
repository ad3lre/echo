<script setup lang="ts">
defineProps<{
  isSetter: boolean;
  setterName: string;
  maxLen: number;
  phraseHelp: string;
  commitError: string;
}>();

const emit = defineEmits<{ submit: [] }>();

const draft = defineModel<string>('draft', { required: true });
</script>

<template>
  <!-- Setter: phrase entry card -->
  <div v-if="isSetter" class="hm-setter">
    <div class="hm-setter__intro">
      <p class="hm-setter__eyebrow">Your turn to set the puzzle</p>
      <p class="hm-setter__hint">
        Type any phrase using A–Z and spaces. Everyone else only sees blanks
        until they guess.
      </p>
    </div>
    <textarea
      id="vc-hangman-phrase"
      v-model="draft"
      rows="2"
      :maxlength="maxLen"
      class="hm-setter__input"
      placeholder="e.g. ECHO PARTY LINE"
      autocomplete="off"
      autocapitalize="characters"
    />
    <div class="hm-setter__footer">
      <span class="hm-setter__count">{{ phraseHelp }}</span>
      <p v-if="commitError" class="hm-setter__error" role="alert">
        {{ commitError }}
      </p>
      <button type="button" class="hm-btn hm-btn--lock" @click="emit('submit')">
        <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect
            x="3"
            y="8"
            width="12"
            height="9"
            rx="2"
            stroke="currentColor"
            stroke-width="1.8"
          />
          <path
            d="M6 8V6a3 3 0 0 1 6 0v2"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
        Lock in phrase
      </button>
    </div>
  </div>

  <!-- Setter: waiting for phrase -->
  <div v-else class="hm-waiting">
    <div class="hm-waiting__dots" aria-hidden="true">
      <span class="hm-waiting__dot" />
      <span class="hm-waiting__dot" />
      <span class="hm-waiting__dot" />
    </div>
    <p class="hm-waiting__who">{{ setterName }}</p>
    <p class="hm-waiting__label">is crafting the secret phrase…</p>
  </div>
</template>

<style scoped lang="scss" src="./styles/HangmanSetterPanel.scss"></style>
