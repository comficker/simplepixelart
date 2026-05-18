<template>
  <div class="main-wrapper">
    <UiScrollProgress/>
    <PartialHeader/>
    <main class="main">
      <div class="container">
        <NuxtPage :transition="{ name: 'page', mode: 'out-in' }"/>
      </div>
    </main>
    <PartialFooter/>
    <UiCommandPalette/>
    <Teleport to="body">
      <UiSonner position="bottom-right"/>
    </Teleport>
  </div>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 180ms ease, transform 220ms cubic-bezier(.22,.61,.36,1);
}
.page-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: none;
  }
  .page-enter-from,
  .page-leave-to {
    transform: none;
  }
}
</style>
