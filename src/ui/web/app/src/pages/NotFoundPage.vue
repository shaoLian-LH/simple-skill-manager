<script setup lang="ts">
import { useWorkspaceSpine } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';

const { t } = useUiI18n();
useWorkspaceSpine(() => ({
  scopeLabel: t('notFound.scopeLabel'),
  scopeDescription: t('notFound.scopeDescription'),
}));
</script>

<template>
  <section class="workspace-page workspace-page--centered">
    <div class="empty-state">
      <p class="eyebrow">{{ t('notFound.eyebrow') }}</p>
      <h3 class="section-title">{{ t('notFound.title') }}</h3>
      <p class="section-copy">{{ t('notFound.copy') }}</p>
    </div>
  </section>
</template>
