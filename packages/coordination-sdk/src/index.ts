// @gbta/coordination — Main exports

// Types
export type {
  Project,
  Participant,
  ParticipantRole,
  Issue,
  IssueComment,
  IssueActivityLog,
  IssueDocument,
  IssueWithRelations,
  IssueDetail,
  DashboardStats,
  IssueCriticality,
  IssueStatus,
  ActivityType,
  CommentSource,
  CreateIssueInput,
  UpdateIssueInput,
  MagicLink,
} from "./types";

// Constants
export { VALID_STATUS_TRANSITIONS } from "./types";

// Client
export { getCoordinationClient, getCoordinationServiceClient } from "./client";

// Hooks (client-side)
export { useCoordinationDashboard } from "./hooks/use-coordination-dashboard";
export { useRealtimeIssue } from "./hooks/use-realtime-issue";
