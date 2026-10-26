# The in-player UI is vanilla TypeScript with a hand-built Notice manager, not React and Sonner

Ensemble's surfaces (the "e" button, the caption line, system-wait dims, the panel and the popup) are written in plain TypeScript, rendered by key inside a Shadow DOM in Netflix's fullscreen element. Notices go through a small hand-built manager that follows Sonner's rules: stable-id updates, persistent Notices that never time out, separate dismiss and timeout events, timers paused while the tab is hidden or the pointer rests on a Notice, and polite and assertive live regions. Sonner is the usual recommendation for toasts, but it needs React, injects its styles into the page `<head>` (here, Netflix's), and Variant B shows only one caption line with a "+N" queue, so it would cover little of what Ensemble draws. Without a framework the bundle stays small and readable, which also keeps Web Store reviews quick.

## Considered Options

- **Preact with headless Sonner** (`toast.custom`, styles copied into the Shadow DOM): it keeps Sonner's tested behaviour, but adds a framework and a compatibility layer to get one caption line.
- **React with headless Sonner**: the same, with a larger runtime injected into every Netflix page.
