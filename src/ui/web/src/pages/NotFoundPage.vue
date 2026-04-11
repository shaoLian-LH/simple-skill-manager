<script setup lang="ts">
import CenteredEmptyState from '../components/CenteredEmptyState.vue';
import { useWorkspaceSpine } from '../lib/chrome';
import { useUiI18n } from '../lib/i18n';

const { t } = useUiI18n();
useWorkspaceSpine(() => ({
  scopeLabel: t('notFound.scopeLabel'),
  scopeDescription: t('notFound.scopeDescription'),
}));
</script>

<template>
  <CenteredEmptyState :eyebrow="t('notFound.eyebrow')" :title="t('notFound.title')" :copy="t('notFound.copy')" />
</template>
