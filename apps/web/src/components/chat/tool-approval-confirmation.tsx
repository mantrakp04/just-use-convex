import { memo, useState } from "react";
import type { ChatAddToolApproveResponseFunction } from "ai";
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
  type ConfirmationProps,
} from "@/components/ai-elements/confirmation";
import { Input } from "@/components/ui/input";

export interface ToolApprovalConfirmationProps {
  approval: ConfirmationProps["approval"];
  state: ConfirmationProps["state"];
  toolApprovalResponse: ChatAddToolApproveResponseFunction;
  requestTitle?: string;
  acceptedTitle?: string;
  rejectedTitle?: string;
  className?: string;
}

export const ToolApprovalConfirmation = memo(function ToolApprovalConfirmation({
  approval,
  state,
  toolApprovalResponse,
  requestTitle,
  acceptedTitle = "Approved.",
  rejectedTitle = "Rejected",
  className = "flex flex-row items-center",
}: ToolApprovalConfirmationProps) {
  const [rejectReason, setRejectReason] = useState("");
  const isDisabled = !approval?.id;

  return (
    <Confirmation approval={approval} state={state} className={className}>
      <ConfirmationRequest>
        <Input
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Reason for rejection"
          disabled={isDisabled}
        />
        {requestTitle && <ConfirmationTitle>{requestTitle}</ConfirmationTitle>}
        <ConfirmationActions>
          <ConfirmationAction
            variant="outline"
            disabled={isDisabled}
            onClick={() => {
              if (!approval?.id) return;
              toolApprovalResponse({
                id: approval.id,
                approved: false,
                reason: rejectReason,
              });
            }}
          >
            Reject
          </ConfirmationAction>
          <ConfirmationAction
            disabled={isDisabled}
            onClick={() => {
              if (!approval?.id) return;
              toolApprovalResponse({
                id: approval.id,
                approved: true,
                reason: undefined,
              });
            }}
          >
            Approve
          </ConfirmationAction>
        </ConfirmationActions>
      </ConfirmationRequest>
      <ConfirmationAccepted>
        <ConfirmationTitle>{acceptedTitle}</ConfirmationTitle>
      </ConfirmationAccepted>
      <ConfirmationRejected>
        <ConfirmationTitle>
          {rejectedTitle}
          {approval?.reason ? `: ${approval.reason}` : "."}
        </ConfirmationTitle>
      </ConfirmationRejected>
    </Confirmation>
  );
});
