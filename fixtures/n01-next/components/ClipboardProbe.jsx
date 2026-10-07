"use client";
// react-clipboard.js (2.0.16) calls ReactDOM.findDOMNode in
// componentDidMount, so it crashes as soon as it mounts on React 19
// (nihey/react-clipboard.js#87).
import React from "react";
import Clipboard from "react-clipboard.js";
export default function ClipboardProbe() {
  React.useEffect(() => {
    const onErr = (e) => { window.__testResult = { ok: false, error: String(e.error || e.message) }; };
    window.addEventListener("error", onErr);
    const t = setTimeout(() => {
      if (typeof window.__testResult === "object") return;
      const b = document.querySelector("button[data-clipboard-text]");
      window.__testResult = b ? { ok: true } : { ok: false, error: "button not rendered (crashed?)" };
    }, 1500);
    return () => clearTimeout(t);
  }, []);
  return <Clipboard data-clipboard-text="hello">copy</Clipboard>;
}
