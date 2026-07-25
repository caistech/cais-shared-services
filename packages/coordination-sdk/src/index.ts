// @caistech/coordination-sdk — Main exports

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
} from "./types/index.js";

// Constants
export { VALID_STATUS_TRANSITIONS } from "./types/index.js";

// Client
export { getCoordinationClient, getCoordinationServiceClient } from "./client.js";

// Hooks (client-side)
export { useCoordinationDashboard } from "./hooks/use-coordination-dashboard.js";
export { useRealtimeIssue } from "./hooks/use-realtime-issue.js";
