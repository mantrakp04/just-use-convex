import {
  CheckCircle2,
  XCircle,
  Clock,
  GitPullRequestDraft,
  GitPullRequest,
  Loader2,
  CircleDot,
  Star,
  CircleDotDashed,
  MessageCircle,
} from "lucide-react";
import { useGithubRepo, useGithubIssuesCount, useGithubMasterStatus, useGithubPRs } from "@/hooks/use-github-repo";
import { env } from "@just-use-convex/env/web";

type GithubStatusState = "pending" | "success" | "failure" | "error";

function StatusIcon({ state }: { state: GithubStatusState | "loading" }) {
  switch (state) {
    case "success":
      return <CheckCircle2 className="size-4 text-green-500" />;
    case "failure":
    case "error":
      return <XCircle className="size-4 text-red-500" />;
    case "pending":
      return <Clock className="size-4 text-yellow-500" />;
    case "loading":
      return <Loader2 className="size-4 text-muted-foreground animate-spin" />;
    default:
      return <CircleDot className="size-4 text-muted-foreground" />;
  }
}

export function GithubHoverContent() {
  const repoQuery = useGithubRepo();
  const issuesQuery = useGithubIssuesCount();
  const masterStatusQuery = useGithubMasterStatus();
  const prsQuery = useGithubPRs();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <a href={`https://github.com/${env.VITE_GITHUB_REPO}/tree/master`} target="_blank" rel="noreferrer" className="font-semibold text-sm hover:underline">master</a>
        <div className="flex items-center">
          {masterStatusQuery.isLoading ? (
            <StatusIcon state="loading" />
          ) : masterStatusQuery.isError ? (
            <span className="text-xs text-red-500">Error</span>
          ) : (
            <StatusIcon state={masterStatusQuery.data?.state || "pending"} />
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {repoQuery.isLoading ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        ) : repoQuery.data ? (
          <a href={`https://github.com/${env.VITE_GITHUB_REPO}/stargazers`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Star className="size-3.5" />
            <span>{repoQuery.data.stargazers_count.toLocaleString()}</span>
          </a>
        ) : null}
        {issuesQuery.isLoading ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        ) : issuesQuery.data ? (
          <a href={`https://github.com/${env.VITE_GITHUB_REPO}/issues`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <CircleDotDashed className="size-3.5" />
            <span>{issuesQuery.data.total_count.toLocaleString()} open</span>
          </a>
        ) : null}
      </div>

      <div className="h-px bg-border w-full" />

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Recent Pull Requests</span>
        {prsQuery.isLoading ? (
          <div className="flex items-center justify-center p-2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : prsQuery.isError ? (
          <span className="text-xs text-red-500">Failed to load PRs</span>
        ) : prsQuery.data?.length === 0 ? (
          <span className="text-xs text-muted-foreground">No open PRs.</span>
        ) : (
          <div className="flex flex-col gap-2">
            {prsQuery.data?.map((pr) => (
              <a
                key={pr.number}
                href={pr.html_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 p-1.5 -mx-1.5 rounded-md hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {pr.draft ? (
                    <GitPullRequestDraft className="size-4 text-muted-foreground shrink-0" />
                  ) : (
                    <GitPullRequest className="size-4 text-green-500 shrink-0" />
                  )}
                  <span className="text-xs truncate" title={pr.title}>
                    {pr.title}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className="flex items-center gap-0.5 text-xs text-muted-foreground"
                    title={`${pr.comments ?? 0} comments, ${pr.review_comments ?? 0} review comments`}
                  >
                    <MessageCircle className="size-3.5" />
                    {(pr.comments ?? 0) + (pr.review_comments ?? 0)}
                  </span>
                  <StatusIcon state={pr.ciStatus?.state || "pending"} />
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
