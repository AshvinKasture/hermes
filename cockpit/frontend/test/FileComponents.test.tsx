import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "../src/components/files/ContextMenu";
import { ConfirmDialog, PromptDialog } from "../src/components/files/Dialogs";
import { FileIcon } from "../src/components/files/FileIcon";
import { FileList } from "../src/components/files/FileList";
import { FileTree } from "../src/components/files/FileTree";
import type { FsEntry } from "../src/lib/files";
import { languageFor } from "../src/lib/language";
import { json, mockApi } from "./helpers";

const e = (name: string, o: Partial<FsEntry> = {}): FsEntry => ({
  name, path: `/h/${name}`, kind: "file", size: 10, mtimeMs: 1_700_000_000_000, mode: 0o644, isSymlink: false, writable: true, ...o,
});

describe("languageFor", () => {
  it("maps names and extensions to Monaco languages", () => {
    expect(languageFor("a.ts")).toBe("typescript");
    expect(languageFor("A.PY")).toBe("python");
    expect(languageFor("Dockerfile")).toBe("dockerfile");
    expect(languageFor(".bashrc")).toBe("shell");
    expect(languageFor("notes.unknown")).toBe("plaintext");
    expect(languageFor("README")).toBe("plaintext");
  });
});

describe("FileIcon", () => {
  it("renders folders, typed files, broken links and symlink badges", () => {
    const { container, rerender } = render(<FileIcon entry={e("d", { kind: "dir" })} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    rerender(<FileIcon entry={e("a.json")} />);
    expect(screen.getByText("{}")).toBeInTheDocument();
    rerender(<FileIcon entry={e("x", { broken: true, kind: "other" })} />);
    expect(screen.getByText("!")).toBeInTheDocument();
    rerender(<FileIcon entry={e("l", { isSymlink: true, linkTarget: "/t" })} large />);
    expect(screen.getByTitle("Symlink → /t")).toBeInTheDocument();
  });
});

describe("FileList", () => {
  const setup = (over: Partial<Parameters<typeof FileList>[0]> = {}) => {
    const props = {
      entries: [e("a.txt"), e("b.txt"), e("c.txt")], view: "list" as const, selected: null as string | null, sortKey: "name" as const, sortDir: "asc" as const,
      onSort: vi.fn(), onSelect: vi.fn(), onOpen: vi.fn(), onUp: vi.fn(), empty: "Nothing here", ...over,
    };
    render(<FileList {...props} />);
    return props;
  };

  it("selects on click, opens on double click, and shows read-only locks", () => {
    const p = setup({ entries: [e("a.txt", { writable: false }), e("b.txt")] });
    fireEvent.click(screen.getByText("a.txt"));
    expect(p.onSelect).toHaveBeenCalledWith("/h/a.txt");
    fireEvent.doubleClick(screen.getByText("b.txt"));
    expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ name: "b.txt" }));
    expect(screen.getByLabelText("read-only")).toBeInTheDocument();
  });

  it("supports keyboard navigation", () => {
    const p = setup({ selected: "/h/a.txt" });
    const box = screen.getByRole("listbox");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(p.onSelect).toHaveBeenLastCalledWith("/h/b.txt");
    fireEvent.keyDown(box, { key: "End" });
    expect(p.onSelect).toHaveBeenLastCalledWith("/h/c.txt");
    fireEvent.keyDown(box, { key: "Home" });
    expect(p.onSelect).toHaveBeenLastCalledWith("/h/a.txt");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ name: "a.txt" }));
    fireEvent.keyDown(box, { key: "Backspace" });
    expect(p.onUp).toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(p.onSelect).toHaveBeenLastCalledWith(null);
  });

  it("clamps arrow navigation at both ends and starts at the first item", () => {
    const p = setup({ selected: "/h/c.txt" });
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(p.onSelect).toHaveBeenLastCalledWith("/h/c.txt");
  });

  it("starts at the first item when nothing is selected", () => {
    const p = setup();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(p.onSelect).toHaveBeenLastCalledWith("/h/a.txt");
  });

  it("sorts via column headers and shows the empty message", () => {
    const p = setup({ entries: [] });
    fireEvent.click(screen.getByRole("button", { name: "Sort by Size" }));
    expect(p.onSort).toHaveBeenCalledWith("size");
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("renders a grid without column headers and ignores horizontal arrows in list mode", () => {
    const p = setup({ view: "grid", selected: "/h/a.txt" });
    expect(screen.queryByRole("button", { name: /Sort by/ })).toBeNull();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowRight" });
    expect(p.onSelect).toHaveBeenLastCalledWith("/h/b.txt");
  });

  it("deselects when the empty background is clicked", () => {
    const p = setup({ selected: "/h/a.txt" });
    fireEvent.click(screen.getByRole("listbox"));
    expect(p.onSelect).toHaveBeenCalledWith(null);
  });
});

describe("ContextMenu", () => {
  it("runs the chosen item, closes, and skips disabled items", () => {
    const run = vi.fn();
    const close = vi.fn();
    const off = vi.fn();
    render(<ContextMenu x={10} y={10} onClose={close} items={[{ label: "Open", onSelect: run }, { label: "Rename", onSelect: off, disabled: true }]} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(off).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Open" }));
    expect(close).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
  });

  it("closes on Escape and outside clicks, and moves focus with arrow keys", () => {
    const close = vi.fn();
    render(<ContextMenu x={0} y={0} onClose={close} items={[{ label: "One", onSelect: () => {} }, { label: "Two", onSelect: () => {} }]} />);
    const one = screen.getByRole("menuitem", { name: "One" });
    const two = screen.getByRole("menuitem", { name: "Two" });
    expect(document.activeElement).toBe(one);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(two);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(one);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(document.body);
    expect(close).toHaveBeenCalledTimes(2);
  });
});

describe("Dialogs", () => {
  it("PromptDialog validates, submits, and surfaces server errors", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error("already exists")).mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<PromptDialog title="Rename" label="Name" initial="a.txt" submitLabel="Go" validate={(v) => (v.includes("/") ? "no slash" : null)} onSubmit={onSubmit} onClose={onClose} />);
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    expect(input.value).toBe("a.txt");
    expect(input.selectionEnd).toBe(1); // "a" selected, ".txt" left alone

    fireEvent.change(input, { target: { value: "x/y" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByRole("alert")).toHaveTextContent("no slash");
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "dup" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("PromptDialog closes on Cancel and Escape", () => {
    const onClose = vi.fn();
    render(<PromptDialog title="T" label="L" submitLabel="Go" onSubmit={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("ConfirmDialog focuses Cancel first and only acts on explicit confirmation", async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error("nope")).mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<ConfirmDialog title="Delete?" message="Sure?" confirmLabel="Delete" danger onConfirm={onConfirm} onClose={onClose} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nope");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("restores focus to the previously focused element on close", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(<ConfirmDialog title="T" message="m" confirmLabel="Ok" onConfirm={() => {}} onClose={() => {}} />);
    expect(document.activeElement).not.toBe(trigger);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

describe("FileTree", () => {
  const listing = (path: string, dirs: string[]) => json({ path, parent: null, writable: false, truncated: false, entries: dirs.map((d) => ({ ...e(d, { kind: "dir" }), path: `${path === "/" ? "" : path}/${d}` })) });

  it("loads ancestors of the current folder, expands lazily and navigates", async () => {
    const f = mockApi({
      "path=%2F$": () => listing("/", ["home", "etc"]),
      "path=%2Fhome": () => listing("/home", ["ashvin"]),
    });
    const onNavigate = vi.fn();
    render(<FileTree cwd="/home/ashvin" home="/home/ashvin" showHidden={false} version={0} cwdDirs={["docs", ".git"]} onNavigate={onNavigate} />);
    expect(await screen.findByText("etc")).toBeInTheDocument();
    expect(await screen.findByText("docs")).toBeInTheDocument();
    expect(screen.queryByText(".git")).toBeNull(); // hidden folders stay hidden
    expect(f).toHaveBeenCalled();
    fireEvent.click(screen.getByText("etc"));
    expect(onNavigate).toHaveBeenCalledWith("/etc");
    fireEvent.click(screen.getByRole("button", { name: /Home/ }));
    expect(onNavigate).toHaveBeenCalledWith("/home/ashvin");
    fireEvent.click(screen.getByRole("button", { name: /Trash/ }));
    expect(onNavigate).toHaveBeenCalledWith("/home/ashvin/.local/share/Trash/files");
  });

  it("shows dotfolders when asked and reports folders that cannot be opened", async () => {
    mockApi({ "path=%2F$": () => json({ error: "denied" }, 403) });
    render(<FileTree cwd="/" home="/h" showHidden version={0} cwdDirs={[".git"]} onNavigate={() => {}} />);
    expect(await screen.findByText(".git")).toBeInTheDocument();
  });

  it("collapses and re-expands a folder", async () => {
    mockApi({ "path=%2F$": () => listing("/", ["etc"]), "path=%2Fetc": () => listing("/etc", ["ssh"]) });
    render(<FileTree cwd="/" home="/h" showHidden={false} version={0} cwdDirs={["etc"]} onNavigate={() => {}} />);
    await screen.findByText("etc");
    fireEvent.click(screen.getByRole("button", { name: "Expand etc" }));
    expect(await screen.findByText("ssh")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse etc" }));
    expect(screen.queryByText("ssh")).toBeNull();
  });
});
