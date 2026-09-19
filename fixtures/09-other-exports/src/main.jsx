import React from "react";
import { createRoot } from "react-dom/client";
import { createPortal, flushSync } from "react-dom";

// Verifies the plugin doesn't change any OTHER react-dom export's
// behavior: createPortal, flushSync, and react-dom/client's createRoot
// must all keep working exactly as they do without the plugin.
window.__testResult = "pending";

function App() {
  const [count, setCount] = React.useState(0);

  // Running the assertion inside useEffect (not an external setTimeout
  // race) guarantees it runs after this render has actually committed —
  // createRoot(...).render(...) is not guaranteed synchronous outside of
  // React's own `act()` test helper, so an external timer can otherwise
  // fire before the first commit.
  React.useEffect(() => {
    if (window.__testResult !== "pending") return;
    // React forbids calling flushSync synchronously from within an effect
    // that's still part of the current commit ("flushSync was called from
    // inside a lifecycle method") — deferring one task, as React's own
    // warning suggests, runs it outside that window.
    setTimeout(() => {
      try {
        const portalNode = document.querySelector('[data-testid="portal-content"]');
        const portalRenderedInTarget =
          portalNode && document.getElementById("portal-target").contains(portalNode);

        flushSync(() => setCount((c) => c + 1));
        // flushSync guarantees the DOM has already been updated
        // synchronously by the time this next line runs.
        const countNode = document.querySelector('[data-testid="count"]');
        const flushSyncWorked = countNode && countNode.textContent === "1";

        window.__testResult = {
          ok: !!(portalRenderedInTarget && flushSyncWorked),
          portalRenderedInTarget: !!portalRenderedInTarget,
          flushSyncWorked: !!flushSyncWorked,
        };
      } catch (e) {
        window.__testResult = { ok: false, error: e.message };
      }
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div data-testid="count">{count}</div>
      {createPortal(
        <div data-testid="portal-content">portal content</div>,
        document.getElementById("portal-target")
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
