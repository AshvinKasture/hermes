import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "../src/components/FilterBar";
import type { FilterOptions } from "../src/types/job";

const options: FilterOptions = {
  companies: ["Acme", "Beta"],
  locations: ["Pune", "Mumbai"],
  sources: ["careers.acme.com"],
};

const emptyFilters = {
  company: "",
  role: "",
  location: "",
  experience: "",
  skills: "",
  source: "",
  search: "",
};

describe("FilterBar", () => {
  it("renders available options and notifies on text and select changes", () => {
    const onFilterChange = vi.fn();
    const { container } = render(
      <FilterBar options={options} filters={emptyFilters} onFilterChange={onFilterChange} onClear={vi.fn()} />,
    );

    expect(screen.getByRole("option", { name: "Acme" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pune" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "careers.acme.com" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear all filters" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/search jobs/i), { target: { value: "React" } });
    fireEvent.change(screen.getByPlaceholderText("Role..."), { target: { value: "Engineer" } });
    fireEvent.change(screen.getByPlaceholderText("Skills..."), { target: { value: "C#" } });
    fireEvent.change(container.querySelectorAll("select")[0], { target: { value: "Acme" } });
    fireEvent.change(container.querySelectorAll("select")[1], { target: { value: "Pune" } });
    fireEvent.change(container.querySelectorAll("select")[2], { target: { value: "careers.acme.com" } });

    expect(onFilterChange).toHaveBeenCalledWith("search", "React");
    expect(onFilterChange).toHaveBeenCalledWith("role", "Engineer");
    expect(onFilterChange).toHaveBeenCalledWith("skills", "C#");
    expect(onFilterChange).toHaveBeenCalledWith("company", "Acme");
    expect(onFilterChange).toHaveBeenCalledWith("location", "Pune");
    expect(onFilterChange).toHaveBeenCalledWith("source", "careers.acme.com");
  });

  it("shows Clear all filters when any filter is active", () => {
    const onClear = vi.fn();
    render(
      <FilterBar
        options={options}
        filters={{ ...emptyFilters, company: "Acme" }}
        onFilterChange={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
