<script setup lang="ts">
import { computed, useSlots } from 'vue';

const props = withDefaults(
  defineProps<{
    tone?: 'muted' | 'error' | 'notice';
    tag?: 'section' | 'div' | 'p';
  }>(),
  {
    tone: 'muted',
    tag: 'section',
  },
);

const slots = useSlots();

const className = computed(() => {
  switch (props.tone) {
    case 'error':
      return 'error-panel';
    case 'notice':
      return 'notice-panel';
    default:
      return 'muted-panel';
  }
});

const hasActions = computed(() => slots.actions !== undefined);
</script>

<template>
  <component :is="props.tag" :class="className">
    <slot />
    <div v-if="hasActions" class="mt-3">
      <slot name="actions" />
    </div>
  </component>
</template>
