import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { configure } from "@testing-library/react";
import { beforeEach } from "vitest";

configure({ testIdAttribute: "data-test" });

// The hash bleeds across tests within a file; replaceState (not a hash
// assignment) so no history entry is pushed per test, which would pollute
// history.back() assertions.
beforeEach(() => {
  window.history.replaceState(null, "", "#/");
});
