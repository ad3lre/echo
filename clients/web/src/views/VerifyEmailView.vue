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

<style scoped src="./styles/VerifyEmailView.scss"></style>
