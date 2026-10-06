import { JobListing } from "../types/job";

interface JobCardProps {
  job: JobListing;
}

function safeSourceLabel(source: string): string {
  try {
    const url = new URL(source.startsWith("http") ? source : `https://${source}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    // Source is not a URL — use the text before any parentheses
    return source.split(/[()]/)[0].trim();
  }
}

export function JobCard({ job }: JobCardProps) {
  const skills = job.skills?.split(",").map((s) => s.trim()).filter(Boolean) || [];

  return (
    <div className="bg-hermes-surface border border-hermes-border rounded-lg p-4 hover:border-hermes-accent/50 transition-colors flex flex-col gap-3">
      {/* Header */}
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-hermes-text font-semibold text-sm leading-tight">
            {job.role}
          </h3>
          <p className="text-hermes-accent text-xs mt-0.5">{job.company}</p>
        </div>
        {job.source && (
          <span
            title={job.source}
            className="min-w-0 max-w-[45%] shrink-0 truncate text-[10px] uppercase tracking-wider bg-hermes-bg text-hermes-muted px-1.5 py-0.5 rounded"
          >
            {safeSourceLabel(job.source)}
          </span>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-hermes-muted">
        {job.location && (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {job.location}
          </span>
        )}
        {job.experience && (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {job.experience}
          </span>
        )}
        {job.date_posted && (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {job.date_posted}
          </span>
        )}
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.slice(0, 5).map((skill) => (
            <span
              key={skill}
              className="text-[10px] bg-hermes-bg text-hermes-muted px-1.5 py-0.5 rounded border border-hermes-border"
            >
              {skill}
            </span>
          ))}
          {skills.length > 5 && (
            <span className="text-[10px] text-hermes-muted">+{skills.length - 5}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <span className="text-[10px] text-hermes-muted">
          {job.job_code && `#${job.job_code}`}
        </span>
        {job.link && (
          <a
            href={job.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-hermes-accent hover:text-hermes-accent/80 transition-colors flex items-center gap-1"
          >
            View
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}