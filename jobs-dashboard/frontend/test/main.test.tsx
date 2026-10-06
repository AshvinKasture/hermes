import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRootMock, renderMock } = vi.hoisted(() => ({
  createRootMock: vi.fn(),
  renderMock: vi.fn(),
}));

vi.mock("react-dom/client", () => ({ createRoot: createRootMock }));
vi.mock("../src/index.css", () => ({}));

beforeEach(() => {
  vi.resetModules();
  createRootMock.mockReset().mockReturnValue({ render: renderMock });
  renderMock.mockReset();
  document.body.innerHTML = '<div id="root"></div>';
});

describe("frontend entrypoint", () => {
  it("mounts the App into the root element", async () => {
    const root = document.getElementById("root");
    await import("../src/main");
    expect(createRootMock).toHaveBeenCalledWith(root);
    expect(renderMock).toHaveBeenCalledOnce();
  });

  it("does nothing when the root element is missing", async () => {
    document.body.innerHTML = "";
    await import("../src/main");
    expect(createRootMock).not.toHaveBeenCalled();
  });
});
