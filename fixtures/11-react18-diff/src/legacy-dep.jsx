// Same shape as fixtures/01-named-import/src/legacy-dep.jsx, but run
// against React 18 (see package.json comment) where findDOMNode already
// works natively without this plugin — baseline is expected to ALREADY
// succeed here, and compat must still succeed too (no regression from
// this plugin's override).
import React from "react";
import { findDOMNode } from "react-dom";

export class LegacyComponent extends React.Component {
  componentDidMount() {
    try {
      const node = findDOMNode(this);
      window.__testResult = {
        ok: true,
        tagName: node && node.tagName,
        isExpectedNode: node === document.querySelector('[data-testid="target"]'),
      };
    } catch (e) {
      window.__testResult = { ok: false, error: e.message };
    }
  }

  render() {
    return React.createElement(
      "div",
      { "data-testid": "target", className: "target" },
      "legacy content"
    );
  }
}
