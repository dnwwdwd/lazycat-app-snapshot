import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, messageForError } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("formal API client", () => {
  it("uses same-origin cookies for the active session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ uid: "tenant-a" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.session()).resolves.toMatchObject({ uid: "tenant-a" });
    expect(fetchMock).toHaveBeenCalledWith("/api/session", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("preserves a stable server error code and request id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "IDENTITY_MISMATCH", message: "身份不一致", requestId: "req-a" }), { status: 403 })));

    await expect(api.applications()).rejects.toEqual(expect.objectContaining<ApiError>({ status: 403, code: "IDENTITY_MISMATCH", requestId: "req-a" }));
  });

  it("maps known stable error codes to Chinese messages", () => {
    expect(messageForError("SESSION_REQUIRED", "fallback")).toContain("重新登录");
    expect(messageForError("UNKNOWN", "fallback")).toBe("fallback");
  });

  it("starts an asynchronous catalog sync", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true, started: true, sync: { state: "RUNNING" } }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.syncApplications()).resolves.toMatchObject({ accepted: true, sync: { state: "RUNNING" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/applications/sync", expect.objectContaining({ method: "POST", credentials: "same-origin" }));
  });

  it("sends cursor and filters to the persisted application API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], sync: { state: "IDLE" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const params = new URLSearchParams({ cursor: "cursor-a", limit: "20", mode: "multi", capability_status: "BACKUPABLE" });

    await api.applications(params);

    expect(fetchMock).toHaveBeenCalledWith("/api/applications?cursor=cursor-a&limit=20&mode=multi&capability_status=BACKUPABLE", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("uses the current-tenant detail and probe endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ deployId: "deploy-a" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true, started: true, sync: { state: "RUNNING" } }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.instance("deploy-a");
    await api.probeInstance("deploy-a");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/instances/deploy-a");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/instances/deploy-a/probe");
  });

  it("creates a manual backup with an explicit shared-instance confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true, job: { id: "backup-a", status: "QUEUED" } }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.startBackup("deploy-a", true)).resolves.toMatchObject({ accepted: true, job: { id: "backup-a" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/instances/deploy-a/backup",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ sharedRiskAccepted: true }),
        headers: expect.objectContaining({ Accept: "application/json", "Content-Type": "application/json" }),
      }),
    );
  });

  it("uses the persisted plan, task and storage endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshotCount: 0, archiveBytes: 0, partialCount: 0, trashCount: 0, missingCount: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.plans();
    await api.tasks(new URLSearchParams({ status: "FAILED" }));
    await api.storage();

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(["/api/plans", "/api/tasks?status=FAILED", "/api/storage"]);
    expect(fetchMock.mock.calls.every(([, init]) => init.credentials === "same-origin")).toBe(true);
  });
});
