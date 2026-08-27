import { describe, expect, it } from "vitest";
import { alerts, applications, navGroups, plans, snapshots } from "./data";

describe("translated V1 prototype data", () => {
  it("keeps the eight PRD navigation entries", () => {
    const routeIds = navGroups.flatMap((group) =>
      group.items.map(([id]) => id),
    );

    expect(routeIds).toEqual([
      "overview",
      "applications",
      "plans",
      "tasks",
      "backups",
      "storage",
      "alerts",
      "settings",
    ]);
  });

  it("retains the prototype status coverage and snapshot metadata", () => {
    expect(applications).toHaveLength(5);
    expect(applications.some((app) => app.mode === "single")).toBe(true);
    expect(
      applications.some((app) => app.status === "UNSUPPORTED_DATABASE"),
    ).toBe(true);
    expect(applications.some((app) => app.status === "NO_DATA")).toBe(true);
    expect(plans).toHaveLength(3);
    expect(snapshots.every((snapshot) => snapshot.integrity)).toBe(true);
    expect(alerts).toHaveLength(3);
  });
});
