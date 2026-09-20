import { createRoot } from "react-dom/client";
import React from "react";
import Draggable from "react-draggable";

window.__testResult = "pending";

// react-draggable (without a `nodeRef` prop) calls its own findDOMNode()
// wrapper, which falls back to ReactDOM.findDOMNode(this). Under React 19
// with no plugin, that fallback is unavailable, so findDOMNode() returns
// null (see build/cjs/Draggable.js) rather than throwing directly — the
// actual crash instead surfaces one call site up, in handleDragStart, as
//   Error: <DraggableCore> not mounted on DragStart!
// (react-grid-layout/react-draggable#670) — a real pointer interaction
// (mousedown, then mousemove, then mouseup) is required to hit it;
// mounting alone isn't enough. scripts/eval-fixture.mjs drives that
// interaction via Playwright's real mouse API against the
// `data-drag-target` element below.
function App() {
  return (
    <Draggable
      onStop={(_e, data) => {
        window.__testResult = { ok: true, x: data.x, y: data.y };
      }}
    >
      <div
        data-testid="target"
        data-drag-target
        className="target"
        style={{ width: 50, height: 50, background: "red", position: "absolute" }}
      >
        drag me
      </div>
    </Draggable>
  );
}

createRoot(document.getElementById("root")).render(<App />);
