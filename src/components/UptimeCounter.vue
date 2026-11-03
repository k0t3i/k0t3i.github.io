<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Locale, SiteContent } from '../content/types';
import { formatHours, uptimeHours } from '../lib/uptime';

const props = defineProps<{ uptime: SiteContent['uptime']; locale: Locale }>();

// The prerender and the first client render both use the build date, so hydration cannot differ.
const hours = ref(uptimeHours(new Date(__BUILD_DATE__)));
onMounted(() => {
  hours.value = uptimeHours(new Date());
});
const text = computed(() => formatHours(hours.value, props.locale));
</script>

<template>
  <p class="uptime">
    {{ props.uptime.before }}<data
      class="uptime__value"
      :value="hours"
    >{{ text }}</data>{{ props.uptime.after }}
  </p>
</template>
