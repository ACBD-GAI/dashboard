import { AlertCircle, CheckCircle2, Clock3, LoaderCircle } from "lucide-react";
import { useRecentJobs } from "../../features/jobs/hooks";

const labels = {
  pending: "Waiting",
  running: "Processing",
  completed: "Completed",
  completed_with_errors: "Completed with errors",
  failed: "Failed",
  cancelled: "Cancelled",
} as const;

export function JobStatusCenter() {
  const jobs = useRecentJobs(true);
  if (!jobs.data?.length) return null;
  return (
    <aside className="jobs-panel" aria-label="Recent background jobs">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Background activity</p>
          <h2>Recent jobs</h2>
        </div>
      </div>
      <div className="job-list">
        {jobs.data.map((job) => {
          const Icon =
            job.status === "running"
              ? LoaderCircle
              : job.status === "pending"
                ? Clock3
                : job.status === "failed"
                  ? AlertCircle
                  : CheckCircle2;
          return (
            <article className={`job-item ${job.status}`} key={job.id}>
              <Icon className={job.status === "running" ? "spin" : ""} />
              <div>
                <strong>{labels[job.status]}</strong>
                <span>{new Date(job.created_at).toLocaleString()}</span>
                {job.error_message && <small>{job.error_message}</small>}
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
