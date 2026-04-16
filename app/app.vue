<template>
  <div class="main-wrapper">
    <PartialHeader/>
    <main class="main">
      <div class="container">
        <NuxtPage/>
      </div>
    </main>
    <PartialFooter/>
    <UiSonner position="bottom-right"/>
  </div>
</template>

<style>
@reference "tailwindcss";

.main-wrapper {
  @apply py-4 md:py-6 space-y-4 px-2 md:px-4;
}

footer {
  @apply text-xs;
}
</style>