<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { apiRequest } from '../lib/api';
import { useWorkspaceSpine } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';
import type { BootView } from '../types';

const router = useRouter();
const { t, withLocalePath } = useUiI18n();
useWorkspaceSpine(() => ({
  scopeLabel: t('boot.scopeLabel'),
  scopeDescription: t('boot.scopeDescription'),
}));

onMounted(async () => {
  const boot = await apiRequest<BootView>('/api/boot');
  await router.replace(withLocalePath(boot.initialRoute));
});
</script>

<template>
  <section class="workspace-page workspace-page--centered">
    <div class="empty-state">
      <p class="eyebrow">{{ t('boot.eyebrow') }}</p>
      <h3 class="section-title">{{ t('boot.title') }}</h3>
      <p class="section-copy">{{ t('boot.copy') }}</p>
    </div>
  </section>
</template>
