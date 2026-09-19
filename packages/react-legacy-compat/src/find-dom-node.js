/**
 * Userland re-implementation of the `findDOMNode` API React itself removed
 * in React 19.
 *
 * This intentionally depends on `instance._reactInternals`, an
 * unsupported/undocumented React internal. See ARCHITECTURE.md
 * ("Known unsupported-internals risk") for why this is the one internal
 * this project relies on and how the risk is contained.
 *
 * Simplified relative to React <=18's own implementation based on
 * experiments recorded in ARCHITECTURE.md / _research/test-update.js and
 * _research/test-unmount.js:
 *
 *   - `instance._reactInternals` is not a snapshot: React keeps it pointing
 *     at whatever fiber is current as of the last commit (verified: the
 *     same object identity is read from componentDidMount through several
 *     subsequent componentDidUpdate calls, its `.child` subtree already
 *     reflecting the latest render on each read). Real legacy callers
 *     (react-transition-group and similar) only ever call findDOMNode from
 *     inside lifecycle methods, i.e. strictly post-commit, so there is no
 *     need to reconcile `fiber` vs `fiber.alternate` the way React's own
 *     removed implementation did to also support the (explicitly
 *     unsupported, and out of scope here) case of calling findDOMNode
 *     mid-render.
 *   - React sets `fiber.stateNode` back to `null` once a class component
 *     unmounts (verified across a plain root.unmount(), a conditional
 *     render-to-null unmount, and an unmount inside <StrictMode>), while
 *     `fiber.stateNode === instance` holds for the entire mounted lifetime,
 *     including inside componentWillUnmount itself. That equality is used
 *     directly as the "is this still mounted" check, instead of walking to
 *     the fiber root and inspecting tag numbers.
 */

const PREFIX = "[react-legacy-compat]";

function isDomNode(value) {
  return (
    value != null &&
    typeof value === "object" &&
    typeof value.nodeType === "number"
  );
}

function assertFiberShape(fiber) {
  for (const key of ["stateNode", "child", "sibling"]) {
    if (!(key in fiber)) {
      throw new Error(
        `${PREFIX} findDOMNode: fiber is missing "${key}". This build of ` +
          "react-dom has a Fiber shape this polyfill doesn't recognize " +
          "(it depends on the unsupported instance._reactInternals " +
          "internal). See ARCHITECTURE.md for the supported version range."
      );
    }
  }
}

function findFirstHostDescendant(fiber) {
  if (isDomNode(fiber.stateNode)) {
    return fiber;
  }
  let child = fiber.child;
  while (child) {
    const match = findFirstHostDescendant(child);
    if (match !== null) return match;
    child = child.sibling;
  }
  return null;
}

/**
 * Drop-in replacement for the removed `ReactDOM.findDOMNode`.
 */
export function findDOMNode(componentOrElement) {
  if (componentOrElement == null) {
    return null;
  }

  if (isDomNode(componentOrElement)) {
    return componentOrElement;
  }

  const fiber = componentOrElement._reactInternals;

  if (fiber === undefined) {
    if (typeof componentOrElement.render === "function") {
      throw new Error(
        `${PREFIX} findDOMNode: Unable to find node on an unmounted component.`
      );
    }
    const keys = Object.keys(componentOrElement).join(",");
    throw new Error(
      `${PREFIX} findDOMNode: Argument appears to not be a ReactComponent. Keys: ${keys}`
    );
  }

  assertFiberShape(fiber);

  if (fiber.stateNode !== componentOrElement) {
    throw new Error(
      `${PREFIX} findDOMNode: Unable to find node on an unmounted component.`
    );
  }

  const hostFiber = findFirstHostDescendant(fiber);
  return hostFiber === null ? null : hostFiber.stateNode;
}
