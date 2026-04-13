<script setup lang="ts">
import { computed, useSlots } from 'vue';

const props = withDefaults(
  defineProps<{
    title: string;
    titleTag?: 'h4' | 'h5';
    muted?: boolean;
  }>(),
  {
    titleTag: 'h4',
    muted: false,
  },
);

const slots = useSlots();

const hasSwitch = computed(() => slots.switch !== undefined);
</script>

<template>
  <article class="switch-button-card" :class="{ 'switch-button-card--muted': props.muted }">
    <div v-if="hasSwitch" class="switch-button-card__switch">
      <slot name="switch" />
    </div>

    <div class="switch-button-card__body" :class="{ 'switch-button-card__body--with-switch': hasSwitch }">
      <div class="switch-button-card__header min-w-0">
        <component :is="props.titleTag" class="switch-button-card__title font-display text-2xl text-charcoal" :title="props.title">
          {{ props.title }}
        </component>
      </div>

      <div class="switch-button-card__content">
        <slot name="body" />
      </div>
    </div>
  </article>
</template>

<style scoped>
.switch-button-card {
  position: relative;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: space-between;
  gap: 1.25rem;
  @apply rounded-shell bg-canvas p-5 shadow-card md:p-6;
}

.switch-button-card--muted {
  background: #f5f5f5;
}

.switch-button-card__switch {
  position: absolute;
  top: 1.25rem;
  right: 1rem;
  z-index: 1;
}

.switch-button-card__body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.switch-button-card__header {
  min-width: 0;
}

.switch-button-card__title {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.12;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.switch-button-card__body--with-switch .switch-button-card__title {
  max-width: calc(100% - 4rem);
}

.switch-button-card__content {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.75rem;
}
</style>
