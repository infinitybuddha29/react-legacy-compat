import React from "react";
import { createRoot } from "react-dom/client";
import { findDOMNode } from "react-dom";

// This fixture specifically checks findDOMNode's behavior on an ALREADY
// unmounted component. Note: under the vanilla React 19 baseline (no
// plugin), findDOMNode is simply undefined and calling it always throws
// "not a function" regardless of mount state — that's a trivially "true"
// but uninteresting result here. The meaningful assertion is with the
// compat plugin enabled: findDOMNode must throw an "unmounted"-flavored
// error, not silently return a stale/wrong node. See EVALS.md.
window.__testResult = "pending";

let instance = null;
class LegacyComponent extends React.Component {
  componentDidMount() {
    instance = this;
    window.__mounted = true;
  }
  render() {
    return (
      <div data-testid="target" className="target">
        content
      </div>
    );
  }
}

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<LegacyComponent />);

function waitFor(predicate, onReady) {
  if (predicate()) {
    onReady();
  } else {
    setTimeout(() => waitFor(predicate, onReady), 10);
  }
}

// createRoot(...).render(...) is not guaranteed synchronous outside of
// React's own act() test helper, so this waits for an explicit
// componentDidMount signal rather than assuming a fixed timeout is enough
// for the initial render to have committed.
waitFor(
  () => window.__mounted === true,
  () => {
    root.unmount();
    waitFor(
      () => instance._reactInternals.stateNode !== instance,
      () => {
        try {
          const node = findDOMNode(instance);
          window.__testResult = {
            ok: false,
            error:
              "expected findDOMNode to throw, but it returned: " +
              (node && node.tagName),
          };
        } catch (e) {
          window.__testResult = { ok: true, threw: true, message: e.message };
        }
      }
    );
  }
);
