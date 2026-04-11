<script setup lang="ts">
const props = defineProps<{
  eyebrow: string;
  title: string;
  copy: string;
}>();
</script>

<template>
  <section class="workspace-page workspace-page--centered">
    <div class="empty-state">
      <p class="eyebrow">{{ props.eyebrow }}</p>
      <h3 class="section-title">{{ props.title }}</h3>
      <p class="section-copy">{{ props.copy }}</p>
    </div>
  </section>
</template>
