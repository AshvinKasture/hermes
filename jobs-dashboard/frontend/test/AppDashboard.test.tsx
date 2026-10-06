import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { AppUser, FilterOptions, JobListing, JobsResult } from "../src/types/job";

const user: AppUser = {
  id: "google-1",
  name: "Ashvin",
  email: "allowed@example.com",
  picture: "",
};

const filterOptions: FilterOptions = {
  companies: ["Acme"],
  locations: ["Pune"],
  sources: ["careers.acme.com"],
};

const job: JobListing = {
  id: 1,
  company: "Acme",
  role: "Senior Engineer",
  experience: "3-5 years",
  location: "Pune",
  skills: "React, TypeScript",
  date_posted: "2026-03-03",
  job_code: "A1",
  link: "https://jobs.example/1",
  source: "careers.acme.com",
  notes: null,
  created_at: "2026-03-03",
};

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function jobsResponse(totalPages = 1): JobsResult {
  return { jobs: [job], total: totalPages * 24, page: 1, totalPages };
}

function stubApi(fetchImpl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => fetchImpl(String(input), init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function resetUrl() {
  window.history.replaceState({}, "", "/jobs/");
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetUrl();
});

describe("App authentication states", () => {
  it("shows the sign-in page when there is no authenticated user", async () => {
    stubApi(() => response(401, {}));
    render(<App />);
    expect(await screen.findByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
  });

  it("shows a failed Google sign-in message on the login page", async () => {
    window.history.replaceState({}, "", "/jobs/?error=auth_failed");
    stubApi(() => response(401, {}));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Google sign-in failed");
  });

  it("shows an access-denied page for a signed-in account outside the allowlist", async () => {
    stubApi(() => response(403, { error: "Access denied" }));
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("not authorized");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("shows a recoverable message when the server cannot verify the session", async () => {
    stubApi(() => response(503, {}));
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Unable to verify access" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("HTTP 503");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("Dashboard", () => {
  it("loads job cards and filter choices for an authorized user", async () => {
    const fetchMock = stubApi((url) => {
      if (url.endsWith("/auth/user")) return response(200, user);
      if (url.endsWith("/api/jobs/filters")) return response(200, filterOptions);
      if (url.includes("/api/jobs?")) return response(200, jobsResponse());
      return response(404, {});
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Senior Engineer" })).toBeInTheDocument();
    expect(screen.getByText("24 listings")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Acme" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/jobs/api/jobs/filters", { credentials: "include" });
  });

  it("shows API errors instead of the empty-search state and retries the jobs request", async () => {
    let jobRequests = 0;
    const fetchMock = stubApi((url) => {
      if (url.endsWith("/auth/user")) return response(200, user);
      if (url.endsWith("/api/jobs/filters")) return response(503, {});
      if (url.includes("/api/jobs?")) {
        jobRequests += 1;
        return jobRequests === 1 ? response(500, {}) : response(200, jobsResponse());
      }
      return response(404, {});
    });

    render(<App />);
    expect(await screen.findByText(/Unable to load job listings \(HTTP 500\)/)).toBeInTheDocument();
    expect(screen.getByText("Could not load filter options (HTTP 503).")).toBeInTheDocument();
    expect(screen.queryByText("No jobs match your filters")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Senior Engineer" })).toBeInTheDocument();
    expect(jobRequests).toBe(2);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("paginates and updates the query when sorting changes", async () => {
    const fetchMock = stubApi((url) => {
      if (url.endsWith("/auth/user")) return response(200, user);
      if (url.endsWith("/api/jobs/filters")) return response(200, filterOptions);
      if (url.includes("/api/jobs?")) return response(200, jobsResponse(8));
      return response(404, {});
    });

    render(<App />);
    await screen.findByRole("heading", { name: "Senior Engineer" });
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("page=2"),
      { credentials: "include" },
    ));

    fireEvent.change(screen.getByDisplayValue("Date Posted"), { target: { value: "company" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("sort_by=company"),
      { credentials: "include" },
    ));
  });
});
