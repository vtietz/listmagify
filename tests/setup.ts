import "@testing-library/jest-dom/vitest";

// Optional: help React Testing Library ensure act() wrapping in React 19
// (usually not necessary, but harmless)
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true