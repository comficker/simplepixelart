<script setup lang="ts">
import {useAuthFetch} from "~/composables/useCustomFetch";
import type {APIResponse, TagSchema} from "~/types";

const {data} = useAuthFetch<APIResponse<TagSchema>>('/coloring/tags/', {
  params: {
    page_size: 20
  }
})

const sizes = ["8x8", "9x9", "10x10", "12x12", "13x13", "16x16", "20x20", "24x24", "32x32", "64x64"];
</script>

<template>
  <div class="page">
    <section class="text-center py-6">
      <div class="h-center v-center gap-4">
        <img class="size-8" src="/favicon.png" alt="">
        <h1 class="text-2xl md:text-4xl">Simple Pixel Art</h1>
      </div>
      <p class="text-xs">Discover trending pixel arts updated daily.</p>
      <div class="v-center mt-4">
        <nuxt-link to="/editor" class="btn primary">
          <span class="icon icon-brush"/>
          <span>Editor</span>
        </nuxt-link>
        <nuxt-link to="/arts" class="btn">
          <span class="icon icon-discovery"/>
          <span>Discover</span>
        </nuxt-link>
      </div>
    </section>
    <client-only>
      <CurrentWork/>
    </client-only>
    <Widget title="New">
      <item-list :limit="6"/>
    </Widget>
    <section>
      <h2>
        <span class="icon icon-angle-right"/>
        <span>Tags:</span>
      </h2>
      <div class="tags">
        <div class="item" v-for="item in data?.results" :key="item.id">
          <nuxt-link :to="`/arts/${item.id_string}`">{{ item.title }}</nuxt-link>
        </div>
      </div>
    </section>
    <section>
      <h2>
        <span class="icon icon-angle-right"/>
        <span>Sizes:</span>
      </h2>
      <div class="tags">
        <div class="item" v-for="item in sizes" :key="item">
          <nuxt-link :to="`/arts/size-${item}`">{{ item }}</nuxt-link>
        </div>
      </div>
    </section>
  </div>
</template>
