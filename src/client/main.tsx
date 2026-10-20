import "./styles/index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { LayoutGroup, MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { router } from "./app/router";
import { useApplyTheme, useTheme } from "./app/theme";
import { queryClient } from "./lib/queries";
import { Toaster } from "./ui";

const REDUCED = { full: "never", reduced: "always", system: "user" } as const;

function App() {
  useApplyTheme();
  const motion = useTheme((s) => s.motion);
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion={REDUCED[motion]}>
        <LayoutGroup id="app">
          <RouterProvider router={router} />
        </LayoutGroup>
        <Toaster />
      </MotionConfig>
    </QueryClientProvider>
  );
}

// Reuse the root across HMR re-runs of this module instead of creating a second one.
const container = document.getElementById("root") as (HTMLElement & { __root?: Root }) | null;
if (container) {
  container.__root ??= createRoot(container);
  container.__root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
