import "@testing-library/jest-dom";
import { cleanup, act } from "@testing-library/react";
import { configure } from "@testing-library/dom";
import { afterEach } from "vitest";

configure({ asyncUtilTimeout: 10000 });

if (typeof window === "undefined") {
  // Node/non-jsdom environments — nothing to stub
} else {

Object.defineProperty(window, "location", {
  value: { origin: "http://localhost:4943", href: "http://localhost:4943/", hostname: "localhost" },
  writable: true,
});

if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!("indexedDB" in window) || (window as any).indexedDB == null) {
  Object.defineProperty(window, "indexedDB", {
    writable: true,
    configurable: true,
    value: {
      open(_name: string, _version?: number): never {
        throw new DOMException("Not available in jsdom", "UnknownError");
      },
      deleteDatabase(): never {
        throw new DOMException("Not available in jsdom", "UnknownError");
      },
      cmp: () => 0,
    },
  });
}

if (typeof (globalThis as any).requestAnimationFrame !== "function") {
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
  (globalThis as any).cancelAnimationFrame = () => {};
}

} // end window guard

afterEach(async () => {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
  cleanup();
});