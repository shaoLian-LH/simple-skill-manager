<script setup lang="ts">
import { onMounted } from 'vue';

import CenteredEmptyState from '../components/CenteredEmptyState.vue';
import { apiRequest } from '../lib/api';
import { useWorkspaceSpine } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';
import { useLocalizedNavigation } from '../lib/navigation';
import type { BootView } from '../types';

const { t } = useUiI18n();
const { replacePath } = useLocalizedNavigation();
useWorkspaceSpine(() => ({
  scopeLabel: t('boot.scopeLabel'),
  scopeDescription: t('boot.scopeDescription'),
}));

onMounted(async () => {
  const boot = await apiRequest<BootView>('/api/boot');
  await replacePath(boot.initialRoute);
});
</script>

<template>
  <CenteredEmptyState :eyebrow="t('boot.eyebrow')" :title="t('boot.title')" :copy="t('boot.copy')" />
</template>
