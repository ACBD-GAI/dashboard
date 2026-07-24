import { useQuery } from "@tanstack/react-query";
import { listRecentJobs } from "../../services/jobs";

const ACTIVE_JOB_STATUSES = new Set(["pending", "running"]);

export function shouldPollJobs(statuses: string[]): boolean {
  return statuses.some((status) => ACTIVE_JOB_STATUSES.has(status));
}

export function useRecentJobs(enabled: boolean) {
  return useQuery({
    queryKey: ["jobs", "recent"],
    queryFn: listRecentJobs,
    enabled,
    refetchInterval: (query) => {
      const jobs = query.state.data;
      return jobs && shouldPollJobs(jobs.map((job) => job.status)) ? 3_000 : false;
    },
    refetchIntervalInBackground: false,
  });
}
