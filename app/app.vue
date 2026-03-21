<template>
  <div class="main-wrapper">
    <PartialHeader/>
    <main class="main">
      <div class="container">
        <NuxtPage/>
      </div>
    </main>
    <PartialFooter/>
  </div>
</template>

<style>
@reference "tailwindcss";

.main-wrapper {
  @apply py-6 space-y-4 p-4;
}

footer {
  @apply text-xs;
}
</style>