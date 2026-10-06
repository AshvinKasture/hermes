import { useState, useEffect, useCallback } from "react";
import { useJobs, useFilterOptions, logout } from "../hooks/useJobs";
import { JobCard } from "./JobCard";
import { FilterBar } from "./FilterBar";
import { AppUser } from "../types/job";

interface DashboardProps {
  user: AppUser;
  onLogout: () => void;
}

const DEFAULT_FILTERS = {
  company: "",
  role: "",
  location: "",
  experience: "",
  skills: "",
  source: "",
  search: "",
  sort_by: "date_posted",
  sort_order: "desc",
};

export function Dashboard({ user, onLogout }: DashboardProps) {
  const { result, loading, error: jobsError, fetchJobs } = useJobs();
  const { options, error: filterOptionsError, fetchOptions } = useFilterOptions();
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const loadJobs = useCallback(() => {
    fetchJobs({
      company: filters.company,
      role: filters.role,
      location: filters.location,
      experience: filters.experience,
      skills: filters.skills,
      source: filters.source,
      search: filters.search,
      sort_by: filters.sort_by,
      sort_order: filters.sort_order as "asc" | "desc",
      page,
      limit: 24,
    });
  }, [fetchJobs, filters, page]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleSortChange = (sort_by: string, sort_order: string) => {
    setFilters((prev) => ({ ...prev, sort_by, sort_order }));
    setPage(1);
  };

  const handleClearFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setPage(1);
  };

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  const totalJobs = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;

  return (
    <div className="min-h-screen bg-hermes-bg text-hermes-text">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-hermes-border bg-hermes-surface/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold">Job Openings</h1>
          <span className="text-xs text-hermes-muted bg-hermes-bg px-2 py-0.5 rounded-full">
            {totalJobs} listing{totalJobs !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {user.picture && (
            <img src={user.picture} alt="" className="w-7 h-7 rounded-full shrink-0" />
          )}
          <span className="text-sm text-hermes-muted hidden sm:inline">{user.email}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-hermes-muted hover:text-hermes-red transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Listings" value={totalJobs} />
          <StatCard label="Companies" value={options.companies.length} />
          <StatCard label="Locations" value={options.locations.length} />
          <StatCard label="Sources" value={options.sources.length} />
        </div>

        {filterOptionsError && (
          <p className="text-sm text-hermes-red" role="alert">
            Could not load filter options ({filterOptionsError}).
          </p>
        )}

        {/* Filters */}
        <FilterBar
          options={options}
          filters={filters}
          onFilterChange={handleFilterChange}
          onClear={handleClearFilters}
        />

        {/* Sort controls */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-hermes-muted">Sort by:</span>
          <select
            value={filters.sort_by}
            onChange={(e) => handleSortChange(e.target.value, filters.sort_order)}
            className="bg-hermes-surface border border-hermes-border rounded-lg px-3 py-1.5 text-sm text-hermes-text focus:outline-none focus:border-hermes-accent"
          >
            <option value="date_posted">Date Posted</option>
            <option value="company">Company</option>
            <option value="role">Role</option>
            <option value="location">Location</option>
          </select>
          <button
            onClick={() => handleSortChange(filters.sort_by, filters.sort_order === "asc" ? "desc" : "asc")}
            className="bg-hermes-surface border border-hermes-border rounded-lg px-3 py-1.5 text-sm text-hermes-muted hover:text-hermes-text transition-colors flex items-center gap-1"
          >
            {filters.sort_order === "desc" ? "↓ Newest" : "↑ Oldest"}
          </button>
        </div>

        {/* Job cards grid */}
        {jobsError ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center" role="alert">
            <p className="text-hermes-red">Unable to load job listings ({jobsError}).</p>
            <button onClick={loadJobs} className="text-sm text-hermes-accent hover:underline">
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-hermes-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : result?.jobs && result.jobs.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {result.jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm bg-hermes-surface border border-hermes-border rounded-lg 
                    disabled:opacity-30 disabled:cursor-not-allowed hover:border-hermes-accent transition-colors"
                >
                  ← Prev
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (page <= 4) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 text-sm rounded-lg transition-colors ${
                        page === pageNum
                          ? "bg-hermes-accent text-white"
                          : "bg-hermes-surface border border-hermes-border hover:border-hermes-accent text-hermes-muted"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm bg-hermes-surface border border-hermes-border rounded-lg 
                    disabled:opacity-30 disabled:cursor-not-allowed hover:border-hermes-accent transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-hermes-muted">
            <svg className="w-12 h-12 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-lg">No jobs match your filters</p>
            <button onClick={handleClearFilters} className="mt-2 text-sm text-hermes-accent hover:underline">
              Clear filters
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-hermes-surface border border-hermes-border rounded-lg p-3">
      <p className="text-xs text-hermes-muted">{label}</p>
      <p className="text-2xl font-bold text-hermes-text mt-1">{value}</p>
    </div>
  );
}