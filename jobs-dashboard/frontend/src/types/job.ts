export interface JobListing {
  id: number;
  company: string;
  role: string;
  experience: string | null;
  location: string | null;
  skills: string | null;
  date_posted: string | null;
  job_code: string | null;
  link: string | null;
  source: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface JobsResult {
  jobs: JobListing[];
  total: number;
  page: number;
  totalPages: number;
}

export interface FilterOptions {
  companies: string[];
  locations: string[];
  sources: string[];
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  picture: string;
}