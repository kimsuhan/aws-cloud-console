function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => { finished: Promise<void> }
}

export function runMotionSafeTransition(update: () => void): void {
  if (typeof document === 'undefined' || prefersReducedMotion()) {
    update()
    return
  }

  const viewTransitionDocument = document as ViewTransitionDocument
  if (typeof viewTransitionDocument.startViewTransition !== 'function') {
    update()
    return
  }

  void viewTransitionDocument.startViewTransition(() => {
    update()
  }).finished.catch(() => undefined)
}
