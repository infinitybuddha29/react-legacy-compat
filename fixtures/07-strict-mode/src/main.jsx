import React from "react";
import { createRoot } from "react-dom/client";
import { findDOMNode } from "react-dom";

window.__testResult = "pending";

// Stands in for a third-party class component, rendered under
// <StrictMode> as any real app might do (React 19 double-invokes render()
// and certain lifecycle methods under StrictMode in dev).
class LegacyComponent extends React.Component {
  componentDidMount() {
    try {
      const node = findDOMNode(this);
      window.__testResult = {
        ok: true,
        tagName: node && node.tagName,
        isExpectedNode:
          node === document.querySelector('[data-testid="target"]'),
      };
    } catch (e) {
      window.__testResult = { ok: false, error: e.message };
    }
  }

  render() {
    return (
      <div data-testid="target" className="target">
        legacy content
      </div>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LegacyComponent />
  </React.StrictMode>
);
