import { FilterOptions } from "../types/job";

interface FilterBarProps {
  options: FilterOptions;
  filters: {
    company: string;
    role: string;
    location: string;
    experience: string;
    skills: string;
    source: string;
    search: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClear: () => void;
}

export function FilterBar({ options, filters, onFilterChange, onClear }: FilterBarProps) {
  const hasActiveFilters = Object.values(filters).some((v) => v !== "");

  return (
    <div className="bg-hermes-surface border border-hermes-border rounded-lg p-4 space-y-3">
      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-hermes-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search jobs by title, company, skills..."
          value={filters.search}
          onChange={(e) => onFilterChange("search", e.target.value)}
          className="w-full bg-hermes-bg border border-hermes-border rounded-lg pl-10 pr-3 py-2 text-sm text-hermes-text placeholder-hermes-muted focus:outline-none focus:border-hermes-accent"
        />
      </div>

      {/* Filter dropdowns */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <select
          value={filters.company}
          onChange={(e) => onFilterChange("company", e.target.value)}
          className="bg-hermes-bg border border-hermes-border rounded-lg px-3 py-2 text-sm text-hermes-text focus:outline-none focus:border-hermes-accent"
        >
          <option value="">All Companies</option>
          {options.companies.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filters.location}
          onChange={(e) => onFilterChange("location", e.target.value)}
          className="bg-hermes-bg border border-hermes-border rounded-lg px-3 py-2 text-sm text-hermes-text focus:outline-none focus:border-hermes-accent"
        >
          <option value="">All Locations</option>
          {options.locations.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>

        <select
          value={filters.source}
          onChange={(e) => onFilterChange("source", e.target.value)}
          className="bg-hermes-bg border border-hermes-border rounded-lg px-3 py-2 text-sm text-hermes-text focus:outline-none focus:border-hermes-accent"
        >
          <option value="">All Sources</option>
          {options.sources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Role..."
          value={filters.role}
          onChange={(e) => onFilterChange("role", e.target.value)}
          className="bg-hermes-bg border border-hermes-border rounded-lg px-3 py-2 text-sm text-hermes-text placeholder-hermes-muted focus:outline-none focus:border-hermes-accent"
        />

        <input
          type="text"
          placeholder="Skills..."
          value={filters.skills}
          onChange={(e) => onFilterChange("skills", e.target.value)}
          className="bg-hermes-bg border border-hermes-border rounded-lg px-3 py-2 text-sm text-hermes-text placeholder-hermes-muted focus:outline-none focus:border-hermes-accent"
        />
      </div>

      {/* Clear button */}
      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="text-xs text-hermes-accent hover:text-hermes-accent/80 transition-colors"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}