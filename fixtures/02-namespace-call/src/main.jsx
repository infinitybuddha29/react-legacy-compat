import { createRoot } from "react-dom/client";
import { LegacyComponent } from "./legacy-dep.jsx";

window.__testResult = "pending";

createRoot(document.getElementById("root")).render(<LegacyComponent />);
