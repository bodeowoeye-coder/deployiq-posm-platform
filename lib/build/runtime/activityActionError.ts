export type RuntimeActivityActionErrorClassification = {
  status: 400 | 403 | 404 | 500;
  message: string;
};

const POSTGRES_RAISE_EXCEPTION = "P0001";

const KNOWN_ACTIVITY_ACTION_ERRORS: Record<string, RuntimeActivityActionErrorClassification> = {
  BUILD_ACTIVITY_ACTION_FORBIDDEN: {
    status: 403,
    message: "You do not have permission to perform this Activity action.",
  },
  BUILD_RESPONSIBILITY_ASSIGNMENT_FORBIDDEN: {
    status: 403,
    message: "You do not have permission to assign Activity responsibility.",
  },
  BUILD_ACTIVITY_ACTOR_INELIGIBLE: {
    status: 403,
    message: "You do not have permission to perform this Activity action.",
  },
  BUILD_RUNTIME_ACTIVITY_UNAVAILABLE: {
    status: 404,
    message: "Activity is unavailable.",
  },
  BUILD_ACTIVITY_FS_PREDECESSOR_INCOMPLETE: {
    status: 400,
    message: "Complete the required predecessor Activity before starting this Activity.",
  },
  BUILD_ACTIVITY_CHECKLIST_INCOMPLETE: {
    status: 400,
    message: "Complete the required checklist before this Activity can be completed.",
  },
  BUILD_ACTIVITY_BLOCKER_REASON_REQUIRED: {
    status: 400,
    message: "Add a blocker reason before reporting this Activity as blocked.",
  },
  BUILD_ACTIVITY_INVALID_TRANSITION: {
    status: 400,
    message: "That Activity action is not valid for its current status.",
  },
  BUILD_ACTIVITY_REVIEW_REQUIRED: {
    status: 400,
    message: "Submit this Activity for review instead of completing it directly.",
  },
};

export function classifyRuntimeActivityActionError(error: unknown): RuntimeActivityActionErrorClassification {
  if (!error || typeof error !== "object") {
    return { status: 500, message: "The Activity action could not be completed." };
  }

  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message.trim() : "";
  if (code !== POSTGRES_RAISE_EXCEPTION) {
    return { status: 500, message: "The Activity action could not be completed." };
  }

  return KNOWN_ACTIVITY_ACTION_ERRORS[message]
    ?? { status: 500, message: "The Activity action could not be completed." };
}
