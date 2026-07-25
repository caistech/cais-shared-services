// @caistech/coordination-sdk/server — Server-side exports
export {
  createProject,
  getProjects,
  addParticipant,
  getProjectParticipants,
  createIssue,
  updateIssue,
  getProjectIssues,
  getIssueDetail,
  getDashboardStats,
  addComment,
  uploadDocument,
  getDocumentUrl,
} from "./actions.js";

export {
  ROLE_ACTIONS,
  allowedActionsFor,
  canViewContent,
  createMagicLink,
  resolveToken,
  revokeMagicLinks,
} from "./magic-links.js";

export { sendTailoredUpdate } from "./ai-pipeline.js";

export {
  coordEvaluatorRegistry,
  COORD_CHANNELS,
  COORD_FREQUENCY_CAP_BYPASS,
} from "./evaluators/index.js";
export type { CoordNudgeType, CoordEvaluatorContext } from "./evaluators/index.js";
