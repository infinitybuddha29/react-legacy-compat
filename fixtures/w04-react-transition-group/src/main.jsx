import { createRoot } from "react-dom/client";
import React from "react";
import { CSSTransition } from "react-transition-group";

window.__testResult = "pending";

function App() {
  return (
    <CSSTransition
      in={true}
      appear
      timeout={0}
      classNames="fade"
      // react-transition-group's <Transition>/<CSSTransition>, when used
      // without the (opt-in, requires editing the call site) `nodeRef`
      // prop, locates its child's DOM node via ReactDOM.findDOMNode(this)
      // internally — exactly the real-world call site this project
      // targets. See node_modules/react-transition-group/cjs/Transition.js.
      onEntered={() => {
        const node = document.querySelector('[data-testid="target"]');
        window.__testResult = {
          ok: true,
          tagName: node && node.tagName,
          hasEnterDoneClass: !!node && node.classList.contains("fade-enter-done"),
        };
      }}
    >
      <div data-testid="target" className="target">
        legacy content
      </div>
    </CSSTransition>
  );
}

createRoot(document.getElementById("root")).render(<App />);
