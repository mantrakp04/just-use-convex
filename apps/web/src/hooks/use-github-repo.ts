import { useQuery } from "@tanstack/react-query";

const REPO = "mantrakp04/just-use-convex";
const STALE_TIME = 60000;

type GithubStatus = {
  state: "pending" | "success" | "failure" | "error";
  total_count: number;
};

type GithubPR = {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  head: { sha: string };
  html_url: string;
};

type GithubRepo = {
  stargazers_count: number;
};

type GithubSearchResult = {
  total_count: number;
};

export type GithubPRWithStatus = GithubPR & { ciStatus: GithubStatus | null };

export function useGithubRepo() {
  return useQuery({
    queryKey: ["github", "repo"],
    queryFn: async () => {
      const res = await fetch(`https://api.github.com/repos/${REPO}`);
      if (!res.ok) throw new Error("Failed to fetch repo info");
      return (await res.json()) as GithubRepo;
    },
    staleTime: STALE_TIME,
  });
}

export function useGithubIssuesCount() {
  return useQuery({
    queryKey: ["github", "issues-count"],
    queryFn: async () => {
      const res = await fetch(
        `https://api.github.com/search/issues?q=repo:${REPO}+type:issue+state:open&per_page=1`
      );
      if (!res.ok) throw new Error("Failed to fetch issues count");
      return (await res.json()) as GithubSearchResult;
    },
    staleTime: STALE_TIME,
  });
}

export function useGithubMasterStatus() {
  return useQuery({
    queryKey: ["github", "status", "master"],
    queryFn: async () => {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/commits/master/status`
      );
      if (!res.ok) throw new Error("Failed to fetch master status");
      return (await res.json()) as GithubStatus;
    },
    staleTime: STALE_TIME,
  });
}

export function useGithubPRs() {
  return useQuery({
    queryKey: ["github", "prs"],
    queryFn: async () => {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/pulls?state=open&per_page=3`
      );
      if (!res.ok) throw new Error("Failed to fetch PRs");
      const prs = (await res.json()) as GithubPR[];

      const prsWithStatus = await Promise.all(
        prs.map(async (pr) => {
          const statusRes = await fetch(
            `https://api.github.com/repos/${REPO}/commits/${pr.head.sha}/status`
          );
          const status = statusRes.ok
            ? ((await statusRes.json()) as GithubStatus)
            : null;
          return { ...pr, ciStatus: status };
        })
      );

      return prsWithStatus;
    },
    staleTime: STALE_TIME,
  });
}
