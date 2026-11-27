// Scrolls only the list that holds an element, never the sidebar or the page.
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

export function revealInContainer(element: HTMLElement | null, containerSelector = ".collapsible-body"): void {
  const container = element?.closest<HTMLElement>(containerSelector) ?? null;
  if (!element || !container || container.scrollHeight <= container.clientHeight) return;
  const containerRect = container.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const top = rect.top - containerRect.top + container.scrollTop;
  container.scrollTop = scrollTopToReveal(container.scrollTop, container.clientHeight, top, rect.height);
}
