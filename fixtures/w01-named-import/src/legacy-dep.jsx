// Stands in for a third-party dependency's source (untouched, not owned by
// the application). Uses the direct named-import call style:
//   import { findDOMNode } from "react-dom";
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
