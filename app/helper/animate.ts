export function pop(x: number, y: number, color: string | null) {
  for (let i = 0; i < 4; i++) {
    createParticle(x, y, color || '#FFF');
  }
}

export function createParticle(x: number, y: number, color: string) {
  if (!x || !y)
    return
  const particle = document.createElement('span');
  particle.classList.add('particle')
  document.body.appendChild(particle);
  const size = Math.floor(Math.random() * 15 + 5);
  particle.style.width = `${size}px`;
  particle.style.height = `${size}px`;
  particle.style.background = color;
  particle.style.zIndex = '99999'
  const destinationX = x + (Math.random() - 0.5) * 2 * 50;
  const destinationY = y + (Math.random() - 0.5) * 2 * 50;
  const animation = particle.animate([
    {
      transform: `translate(${x - (size / 2)}px, ${y - (size / 2)}px)`,
      opacity: 1
    },
    {
      transform: `translate(${destinationX}px, ${destinationY}px)`,
      opacity: 0
    }
  ], {
    duration: 500 + Math.random() * 1000,
    easing: 'cubic-bezier(0, .9, .57, 1)',
    delay: Math.random() * 200
  });
  animation.onfinish = () => {
    particle.remove();
  };
}
