import React from "react";
import ReactDOM from "react-dom";

import App from "./popup/App";
import { popupInit } from "./popup/store";

ReactDOM.render(<App />, document.getElementById("root"));

popupInit().catch(() => {});
