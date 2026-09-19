// Stands in for a third-party dependency's source. Uses the default/
// namespace import call style many real legacy packages use:
//   import ReactDOM from "react-dom";
//   ReactDOM.findDOMNode(this);
import React from "react";
import ReactDOM from "react-dom";

export class LegacyComponent extends React.Component {
  componentDidMount() {
    try {
      const node = ReactDOM.findDOMNode(this);
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
