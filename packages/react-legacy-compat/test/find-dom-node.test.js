import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>'
);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const ReactDOMClient = await import("react-dom/client");
const { act } = React;
const { findDOMNode } = await import("../src/find-dom-node.js");

function mount(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

test("findDOMNode(null) returns null", () => {
  assert.equal(findDOMNode(null), null);
  assert.equal(findDOMNode(undefined), null);
});

test("findDOMNode(domNode) passes through unchanged", () => {
  const el = document.createElement("span");
  assert.equal(findDOMNode(el), el);
});

test("findDOMNode(classInstance) returns the rendered host node", () => {
  let instance = null;
  class Foo extends React.Component {
    componentDidMount() {
      instance = this;
    }
    render() {
      return React.createElement(
        "div",
        { className: "target" },
        "hello"
      );
    }
  }

  const { container } = mount(React.createElement(Foo));
  assert.ok(instance, "componentDidMount should have run");

  const node = findDOMNode(instance);
  assert.equal(node, container.querySelector(".target"));
  assert.equal(node.tagName, "DIV");
});

test("findDOMNode resolves through nested function/fragment children to the first host node", () => {
  let instance = null;
  function Middle({ children }) {
    return React.createElement(React.Fragment, null, children);
  }
  class Outer extends React.Component {
    componentDidMount() {
      instance = this;
    }
    render() {
      return React.createElement(
        Middle,
        null,
        React.createElement("span", { className: "inner" }, "x")
      );
    }
  }

  const { container } = mount(React.createElement(Outer));
  const node = findDOMNode(instance);
  assert.equal(node, container.querySelector(".inner"));
});

test("findDOMNode reflects the latest render across componentDidUpdate", () => {
  let instance = null;
  class Counter extends React.Component {
    componentDidMount() {
      instance = this;
    }
    render() {
      return React.createElement(
        "div",
        { "data-count": this.props.count },
        String(this.props.count)
      );
    }
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  act(() => root.render(React.createElement(Counter, { count: 0 })));
  act(() => root.render(React.createElement(Counter, { count: 1 })));
  act(() => root.render(React.createElement(Counter, { count: 2 })));

  const node = findDOMNode(instance);
  assert.equal(node.getAttribute("data-count"), "2");
});

test("findDOMNode throws for an unmounted instance", () => {
  let instance = null;
  class Foo extends React.Component {
    componentDidMount() {
      instance = this;
    }
    render() {
      return React.createElement("div", null, "hi");
    }
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  act(() => root.render(React.createElement(Foo)));
  act(() => root.unmount());

  assert.throws(() => findDOMNode(instance), /unmounted/i);
});

test("findDOMNode works inside StrictMode", () => {
  let instance = null;
  class Foo extends React.Component {
    componentDidMount() {
      instance = this;
    }
    render() {
      return React.createElement("div", { className: "strict-target" }, "hi");
    }
  }

  const { container } = mount(
    React.createElement(React.StrictMode, null, React.createElement(Foo))
  );
  const node = findDOMNode(instance);
  assert.equal(node, container.querySelector(".strict-target"));
});

test("findDOMNode returns null for a component that renders nothing", () => {
  let instance = null;
  class Empty extends React.Component {
    componentDidMount() {
      instance = this;
    }
    render() {
      return null;
    }
  }

  mount(React.createElement(Empty));
  assert.equal(findDOMNode(instance), null);
});
