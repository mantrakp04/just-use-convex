import { useQuery } from "@tanstack/react-query";
import { env } from "@just-use-convex/env/web";

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
  comments: number;
  review_comments: number;
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
      const res = await fetch(`https://api.github.com/repos/${env.VITE_GITHUB_REPO}`);
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
        `https://api.github.com/search/issues?q=repo:${env.VITE_GITHUB_REPO}+type:issue+state:open&per_page=1`
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
        `https://api.github.com/repos/${env.VITE_GITHUB_REPO}/commits/master/status`
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
      const listRes = await fetch(
        `https://api.github.com/repos/${env.VITE_GITHUB_REPO}/pulls?state=open&per_page=3`
      );
      if (!listRes.ok) throw new Error("Failed to fetch PRs");
      const listPrs = (await listRes.json()) as Pick<GithubPR, "number">[];

      const prsWithStatus = await Promise.all(
        listPrs.map(async ({ number: prNumber }) => {
          const prRes = await fetch(
            `https://api.github.com/repos/${env.VITE_GITHUB_REPO}/pulls/${prNumber}`
          );
          if (!prRes.ok) return null;
          const pr = (await prRes.json()) as GithubPR;

          const statusRes = await fetch(
            `https://api.github.com/repos/${env.VITE_GITHUB_REPO}/commits/${pr.head.sha}/status`
          );
          const status = statusRes.ok
            ? ((await statusRes.json()) as GithubStatus)
            : null;

          return { ...pr, ciStatus: status };
        })
      );

      return prsWithStatus.filter((p): p is NonNullable<typeof p> => p != null);
    },
    staleTime: STALE_TIME,
  });
}
