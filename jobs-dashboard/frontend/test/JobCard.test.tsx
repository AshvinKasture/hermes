import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JobCard } from "../src/components/JobCard";
import type { JobListing } from "../src/types/job";

const baseJob: JobListing = {
  id: 1,
  company: "Acme",
  role: "Senior Engineer",
  experience: "3-5 years",
  location: "Pune",
  skills: ".NET, React, SQL, Node, Docker, Azure, Git",
  date_posted: "2026-03-03",
  job_code: "A-123",
  link: "https://jobs.example/1",
  source: "https://www.careers.acme.com/jobs",
  notes: null,
  created_at: "2026-03-03",
};

describe("JobCard", () => {
  it("renders job details, a safe source label, and limits visible skills", () => {
    render(<JobCard job={baseJob} />);

    expect(screen.getByRole("heading", { name: "Senior Engineer" })).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("careers.acme.com")).toBeInTheDocument();
    expect(screen.getByText("Pune")).toBeInTheDocument();
    expect(screen.getByText("3-5 years")).toBeInTheDocument();
    expect(screen.getByText("2026-03-03")).toBeInTheDocument();
    expect(screen.getByText("#A-123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view/i })).toHaveAttribute("href", baseJob.link);
    expect(screen.getByRole("link", { name: /view/i })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getAllByText(/^(\.NET|React|SQL|Node|Docker)$/)).toHaveLength(5);
  });

  it("truncates long source badges and keeps the original source as a tooltip", () => {
    const source = "very-long-careers-hostname.example-enterprise-domain.com";
    render(<JobCard job={{ ...baseJob, source }} />);
    const badge = screen.getByTitle(source);
    expect(badge).toHaveClass("truncate", "max-w-[45%]");
    expect(badge).toHaveTextContent(source);
  });

  it("uses text before parentheses for non-URL source labels", () => {
    render(<JobCard job={{ ...baseJob, source: "careers.example.com (Company ATS)" }} />);
    expect(screen.getByText("careers.example.com")).toBeInTheDocument();
  });

  it("omits optional details when their values are empty", () => {
    render(<JobCard job={{
      ...baseJob,
      experience: null,
      location: null,
      skills: null,
      date_posted: null,
      job_code: null,
      link: null,
      source: null,
    }} />);
    expect(screen.queryByTitle(baseJob.source!)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view/i })).not.toBeInTheDocument();
  });
});
