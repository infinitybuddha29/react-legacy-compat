"use client";
// Rendered from both an App Router page (app/page.jsx, where Next resolves
// `react-dom` to its own vendored next/dist/compiled/react-dom) and a Pages
// Router page (pages/legacy.jsx, where it resolves to the project's own
// react-dom), so both copies get exercised. Covers the three call styles
// real dependencies use: a named import (the "Attempted import error"
// reported for react-datasheet-grid / amis under Next), the
// ReactDOM.findDOMNode namespace call, and react-transition-group's
// <CSSTransition> without nodeRef.
import React from "react";
import ReactDOM, { findDOMNode } from "react-dom";
import { CSSTransition } from "react-transition-group";

class Named extends React.Component {
  componentDidMount() { this.props.onNode(findDOMNode(this)); }
  render() { return <span data-testid="named">named</span>; }
}
class Ns extends React.Component {
  componentDidMount() { this.props.onNode(ReactDOM.findDOMNode(this)); }
  render() { return <span data-testid="ns">ns</span>; }
}

export default function Probe() {
  const [r, setR] = React.useState({});
  const done = r.named && r.ns && r.rtg;
  React.useEffect(() => { if (done) window.__testResult = { ok: true, ...r }; }, [done]);
  React.useEffect(() => {
    const onErr = (e) => { window.__testResult = { ok: false, error: String(e.error || e.message || e.reason) }; };
    window.addEventListener("error", onErr); window.addEventListener("unhandledrejection", onErr);
  }, []);
  return (
    <div>
      <Named onNode={(n) => setR((s) => ({ ...s, named: n && n.tagName }))} />
      <Ns onNode={(n) => setR((s) => ({ ...s, ns: n && n.tagName }))} />
      <CSSTransition in appear timeout={0} classNames="fade"
        onEntered={() => setR((s) => ({ ...s, rtg: document.querySelector('[data-testid=rtg]').className }))}>
        <div data-testid="rtg">rtg</div>
      </CSSTransition>
    </div>
  );
}
