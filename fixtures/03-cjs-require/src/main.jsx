import { createRoot } from "react-dom/client";
import { LegacyComponent } from "legacy-cjs-dep";

window.__testResult = "pending";

createRoot(document.getElementById("root")).render(<LegacyComponent />);