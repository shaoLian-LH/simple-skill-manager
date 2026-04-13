<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    id: string;
    modelValue: string;
    label: string;
    placeholder: string;
    hideLabel?: boolean;
  }>(),
  {
    hideLabel: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

function updateValue(event: Event): void {
  const target = event.target;
  emit('update:modelValue', target instanceof HTMLInputElement ? target.value : '');
}
</script>

<template>
  <header class="page-search-bar">
    <label v-if="!props.hideLabel" class="page-search-bar__label" :for="props.id">{{ props.label }}</label>
    <div class="page-search-bar__input">
      <input
        :id="props.id"
        :value="props.modelValue"
        class="text-input"
        type="search"
        :placeholder="props.placeholder"
        :aria-label="props.hideLabel ? props.label : undefined"
        @input="updateValue"
      />
    </div>
  </header>
</template>
