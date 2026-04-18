// @gbta/coordination/server — Server-side exports
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
} from "./actions";

export {
  createMagicLink,
  resolveToken,
  revokeMagicLinks,
} from "./magic-links";

export { sendTailoredUpdate } from "./ai-pipeline";

export {
  coordEvaluatorRegistry,
  COORD_CHANNELS,
  COORD_FREQUENCY_CAP_BYPASS,
} from "./evaluators";
export type { CoordNudgeType, CoordEvaluatorContext } from "./evaluators";
