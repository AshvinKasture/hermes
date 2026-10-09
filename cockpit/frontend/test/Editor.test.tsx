import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

// Monaco can't run in jsdom. Replace it with a stub that records the Ctrl+S command the
// real editor would register once on mount, so we can check which handler it runs later.
const registered: { id: string; run: () => void }[] = [];
vi.mock("../src/components/files/monacoSetup", () => ({}));
vi.mock("@monaco-editor/react", () => ({
  default: (props: { value: string; onMount: (editor: unknown, monaco: unknown) => void }) => {
    // Like the real editor: onMount runs ONCE, when the editor is created, never on re-render.
    useEffect(() => {
      registered.length = 0;
      props.onMount(
        { addCommand: (id: string, run: () => void) => registered.push({ id: String(id), run }), focus: () => {} },
        { KeyMod: { CtrlCmd: 1 }, KeyCode: { KeyS: 2 } }
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <textarea aria-label="stub editor" defaultValue={props.value} />;
  },
}));

import { Editor } from "../src/components/files/Editor";

describe("Editor", () => {
  it("registers Ctrl+S once and always runs the latest save handler", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Editor name="a.txt" value="x" readOnly={false} onChange={() => {}} onSave={first} />);
    await waitFor(() => expect(screen.getByLabelText("stub editor")).toBeInTheDocument());
    expect(registered).toHaveLength(1);
    expect(registered[0].id).toBe("3"); // CtrlCmd | KeyS

    // The parent re-renders with a new handler (fresh content and etag after typing).
    rerender(<Editor name="a.txt" value="y" readOnly={false} onChange={() => {}} onSave={second} />);
    registered[0].run();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled(); // the stale first-render closure must never run
  });
});
