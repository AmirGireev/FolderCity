// Scrolls only the container that holds an element, never the whole page.
export function scrollTopToReveal(
  scrollTop: number,
  containerHeight: number,
  elementTop: number,
  elementHeight: number,
): number {
  if (elementTop < scrollTop) return Math.max(0, elementTop);
  if (elementTop + elementHeight > scrollTop + containerHeight) return Math.max(0, elementTop + elementHeight - containerHeight);
  return scrollTop;
}

export function scrollTopToCenter(containerHeight: number, elementTop: number, elementHeight: number): number {
  return Math.max(0, elementTop - containerHeight / 2 + elementHeight / 2);
}

export function nearestScrollable(element: HTMLElement | null): HTMLElement | null {
  for (let current = element?.parentElement ?? null; current; current = current.parentElement) {
    const overflow = getComputedStyle(current).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && current.scrollHeight > current.clientHeight) return current;
  }
  return null;
}

export function revealInContainer(element: HTMLElement | null): void {
  const container = nearestScrollable(element);
  if (!element || !container) return;
  const containerRect = container.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const top = rect.top - containerRect.top + container.scrollTop;
  container.scrollTop = scrollTopToReveal(container.scrollTop, container.clientHeight, top, rect.height);
}
