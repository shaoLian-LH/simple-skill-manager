<script setup lang="ts">
interface Props {
  checked: boolean;
  pending?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  pending: false,
  disabled: false,
});

const emit = defineEmits<{
  toggle: [];
}>();

function onClick(): void {
  emit('toggle');
}
</script>

<template>
  <button
    type="button"
    class="skill-switch"
    :class="{ 'skill-switch--enabled': props.checked }"
    v-bind="$attrs"
    role="switch"
    :aria-checked="props.checked"
    :aria-label="props.ariaLabel"
    :disabled="props.disabled"
    @keydown.stop
    @click.stop="onClick"
  >
    <span class="skill-switch__track" :class="{ 'skill-switch__track--pending': props.pending }" aria-hidden="true">
      <span class="skill-switch__knob" />
    </span>
  </button>
</template>
