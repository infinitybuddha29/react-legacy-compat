// Simulates a real third-party dependency shipped as plain CommonJS,
// installed into node_modules like a real npm package (not app source) so
// it goes through Vite's actual CJS dependency-optimization/interop
// pipeline, using require('react-dom') rather than an ES import.
"use strict";

var React = require("react");
var ReactDOM = require("react-dom");

class LegacyComponent extends React.Component {
  componentDidMount() {
    try {
      var node = ReactDOM.findDOMNode(this);
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
    return React.createElement(
      "div",
      { "data-testid": "target", className: "target" },
      "legacy content"
    );
  }
}

module.exports = { LegacyComponent: LegacyComponent };
