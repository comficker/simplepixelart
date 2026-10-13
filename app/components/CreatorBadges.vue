<script setup lang="ts">
/* The labels beside a creator's name: Pro (bought), Verified (set by
   staff), Artist (accepted into the Creator Program). The API sends them in
   display order. */
defineProps<{ badges?: string[] | null }>()

const BADGES: Record<string, { icon: string; key: string; to?: string }> = {
  pro: {icon: 'icon-crown', key: 'c_CreatorBadges.pro'},
  verified: {icon: 'icon-check-decagram', key: 'c_CreatorBadges.verified'},
  artist: {icon: 'icon-palette', key: 'c_CreatorBadges.artist', to: '/creator-program'},
}
</script>

<template>
  <span v-if="badges?.length" class="cbadges">
    <template v-for="b in badges" :key="b">
      <template v-if="BADGES[b]">
        <NuxtLinkLocale
            v-if="BADGES[b].to"
            :to="BADGES[b].to"
            class="cbadge"
            :class="`is-${b}`"
            :title="$t(`${BADGES[b].key}Hint`)"
        >
          <span class="icon" :class="BADGES[b].icon"/><span>{{ $t(BADGES[b].key) }}</span>
        </NuxtLinkLocale>
        <span v-else class="cbadge" :class="`is-${b}`" :title="$t(`${BADGES[b].key}Hint`)">
          <span class="icon" :class="BADGES[b].icon"/><span>{{ $t(BADGES[b].key) }}</span>
        </span>
      </template>
    </template>
  </span>
</template>

<style scoped>
.cbadges {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
}

.cbadge {
  --c: var(--muted);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  font-size: var(--text-2xs);
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  color: var(--c);
  border: 1px solid color-mix(in oklab, var(--c) 55%, transparent);
  border-radius: var(--radius-pill);
}

.cbadge .icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.cbadge.is-pro { --c: var(--warning); }
.cbadge.is-verified { --c: var(--primary); }
.cbadge.is-artist { --c: var(--success); }

@media (hover: hover) and (pointer: fine) {
  a.cbadge:hover { color: var(--c); background: color-mix(in oklab, var(--c) 12%, transparent); }
}
</style>
