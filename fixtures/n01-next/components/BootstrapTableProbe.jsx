"use client";
// react-bootstrap-table-next (unmaintained, 4.0.3): expandRow animates the
// expanded row with react-transition-group's <CSSTransition> without
// nodeRef, so clicking a row crashes on React 19 (react-bootstrap-table2#1818).
import React from "react";
import BootstrapTable from "react-bootstrap-table-next";
export default function BootstrapTableProbe() {
  React.useEffect(() => {
    const onErr = (e) => { window.__testResult = { ok: false, error: String(e.error || e.message) }; };
    window.addEventListener("error", onErr);
    // Guarded: next dev runs effects twice (StrictMode), and a second
    // click would collapse the row again.
    setTimeout(() => {
      if (window.__clicked) return;
      window.__clicked = true;
      document.querySelector("tbody tr td")?.click();
    }, 500);
    const t = setTimeout(() => {
      if (typeof window.__testResult === "object") return;
      const ex = document.querySelector(".reset-expansion-style");
      window.__testResult = ex && ex.textContent.includes("details for 1") ? { ok: true, expanded: ex.textContent } : { ok: false, error: "row did not expand" };
    }, 2500);
    return () => clearTimeout(t);
  }, []);
  return <BootstrapTable keyField="id" data={[{ id: 1, name: "a" }, { id: 2, name: "b" }]}
    columns={[{ dataField: "id", text: "ID" }, { dataField: "name", text: "Name" }]}
    expandRow={{ renderer: (row) => <div>details for {row.id}</div> }} />;
}
