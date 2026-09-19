import React from "react";
import { createRoot } from "react-dom/client";
import ReactQuill from "react-quill";

// react-quill@2.0.0's editor wrapper calls
// ReactDOM.findDOMNode(this.editingArea) internally in getEditingArea()
// (verified in node_modules/react-quill/lib/index.js) — this call always
// throws under vanilla React 19 the moment findDOMNode is accessed,
// regardless of what argument would have been passed, because the
// property itself doesn't exist on react-dom's default export anymore.
window.__testResult = "pending";

window.addEventListener("error", (e) => {
  if (window.__testResult === "pending") {
    window.__testResult = { ok: false, error: e.message };
  }
});

function App() {
  const [value, setValue] = React.useState("");
  const quillRef = React.useRef(null);

  React.useEffect(() => {
    // getEditingArea() (which calls findDOMNode internally) runs as part
    // of Quill's own initialization inside react-quill's componentDidMount
    // — by the time this effect runs (after commit), it has already
    // either thrown (caught by the window 'error' listener above) or
    // succeeded, in which case Quill will have mounted its own editor DOM
        // (a `.ql-editor` contenteditable node) inside our container.
    if (window.__testResult !== "pending") return;
    const editorNode = document.querySelector(".ql-editor");
    window.__testResult = {
      ok: !!editorNode,
      hasQuillEditor: !!editorNode,
    };
  }, []);

  return (
    <ReactQuill ref={quillRef} value={value} onChange={setValue} theme="snow" />
  );
}

createRoot(document.getElementById("root")).render(<App />);
