<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { authVerifyEmail } from '@/api/authClient';
import { withBasePath } from '@/features/layout/urlNavigation';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { echoT } from '@/i18n';

const busy = ref(true);
const errorMessage = ref<string | null>(null);

function readVerificationTokenFromLocation(): string {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash.replace(/^#/, '').trim();
  if (hash) {
    const hashParams = new URLSearchParams(
      hash.startsWith('?') ? hash.slice(1) : hash,
    );
    const fromHash = hashParams.get('token')?.trim();
    if (fromHash) return fromHash;
  }
  return new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
}

onMounted(async () => {
  const token = readVerificationTokenFromLocation();
  if (!token) {
    busy.value = false;
    errorMessage.value =
      'This verification link is missing a token. Open the latest email from Echo or request a new link from Settings.';
    return;
  }
  try {
    await authVerifyEmail(token);
    useAuthSessionStore().setEmailVerificationFlash(
      echoT('bootstrap.emailVerifiedFlash'),
    );
    const base = import.meta.env.BASE_URL || '/';
    window.location.replace(withBasePath('/explore?emailVerified=1', base));
  } catch (e) {
    busy.value = false;
    errorMessage.value =
      e instanceof Error
        ? e.message
        : 'Verification failed. The link may have expired.';
  }
});

const homeHref =
  typeof window !== 'undefined'
    ? withBasePath('/explore', import.meta.env.BASE_URL || '/')
    : '/explore';
</script>

<template>
  <div class="verify-page">
    <div class="verify-card">
      <h1 class="verify-title">Verify your email</h1>
      <p v-if="busy" class="verify-lead" role="status">
        Confirming your address…
      </p>
      <template v-else>
        <p v-if="errorMessage" class="verify-error" role="alert">
          {{ errorMessage }}
        </p>
        <p class="verify-lead">
          <a :href="homeHref">Return to Echo</a>
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.verify-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: var(--echo-bg-base, #0d0812);
  color: var(--echo-text-primary, #f5f0fa);
}
.verify-card {
  width: min(100%, 28rem);
  padding: 1.75rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--echo-bg-elevated, #1a1224) 92%, #000);
  box-shadow: 0 12px 40px rgb(0 0 0 / 35%);
}
.verify-title {
  margin: 0 0 0.75rem;
  font-size: 1.35rem;
  font-weight: 600;
}
.verify-lead {
  margin: 0;
  line-height: 1.5;
  opacity: 0.9;
}
.verify-error {
  margin: 0 0 1rem;
  color: #ffb4b4;
  line-height: 1.5;
}
.verify-lead a {
  color: var(--echo-accent, #c084fc);
}
</style>
