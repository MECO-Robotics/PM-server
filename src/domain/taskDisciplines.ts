import type { Discipline, Project } from "./types";

export type TaskDisciplineBucket =
  | "robot"
  | "operations"
  | "media"
  | "outreach"
  | "strategy"
  | "training";

const ROBOT_TASK_DISCIPLINES: Discipline[] = [
  { id: "design", code: "design", name: "Design" },
  { id: "manufacturing", code: "manufacturing", name: "Manufacturing" },
  { id: "assembly", code: "assembly", name: "Assembly" },
  { id: "electrical", code: "electrical", name: "Electrical" },
  { id: "programming", code: "programming", name: "Programming" },
  { id: "testing", code: "testing", name: "Testing" },
  { id: "planning", code: "planning", name: "Planning" },
];

const OPERATIONS_TASK_DISCIPLINES: Discipline[] = [
  { id: "communications", code: "communications", name: "Communications" },
  { id: "finance", code: "finance", name: "Finance" },
  { id: "research", code: "research", name: "Research" },
  { id: "documentation", code: "documentation", name: "Documentation" },
  { id: "planning", code: "planning", name: "Planning" },
];

const MEDIA_TASK_DISCIPLINES: Discipline[] = [
  { id: "photography", code: "photography", name: "Photography" },
  { id: "video", code: "video", name: "Video" },
  { id: "graphics", code: "graphics", name: "Graphics" },
  { id: "writing", code: "writing", name: "Writing" },
  { id: "web", code: "web", name: "Web" },
  { id: "social_media", code: "social_media", name: "Social Media" },
];

const OUTREACH_TASK_DISCIPLINES: Discipline[] = [
  { id: "engagement", code: "engagement", name: "Engagement" },
  { id: "presentation", code: "presentation", name: "Presentation" },
  { id: "documentation", code: "documentation", name: "Documentation" },
  { id: "media_production", code: "media_production", name: "Media Production" },
  { id: "partnerships", code: "partnerships", name: "Partnerships" },
];

const STRATEGY_TASK_DISCIPLINES: Discipline[] = [
  { id: "game_analysis", code: "game_analysis", name: "Game Analysis" },
  { id: "scouting", code: "scouting", name: "Scouting" },
  { id: "data_analysis", code: "data_analysis", name: "Data Analysis" },
  { id: "documentation", code: "documentation", name: "Documentation" },
  { id: "planning", code: "planning", name: "Planning" },
  { id: "risk_review", code: "risk_review", name: "Risk Review" },
];

const TRAINING_TASK_DISCIPLINES: Discipline[] = [
  { id: "curriculum", code: "curriculum", name: "Curriculum" },
  { id: "instruction", code: "instruction", name: "Instruction" },
  { id: "documentation", code: "documentation", name: "Documentation" },
  { id: "practice", code: "practice", name: "Practice" },
  { id: "assessment", code: "assessment", name: "Assessment" },
  { id: "planning", code: "planning", name: "Planning" },
];

export const TASK_DISCIPLINE_DEFINITIONS: Discipline[] = [
  ...ROBOT_TASK_DISCIPLINES,
  ...OPERATIONS_TASK_DISCIPLINES.filter((discipline) =>
    !["documentation", "planning"].includes(discipline.id),
  ),
  ...MEDIA_TASK_DISCIPLINES,
  ...OUTREACH_TASK_DISCIPLINES.filter((discipline) => discipline.id !== "documentation"),
  ...STRATEGY_TASK_DISCIPLINES.filter((discipline) =>
    !["documentation", "planning"].includes(discipline.id),
  ),
  ...TRAINING_TASK_DISCIPLINES.filter((discipline) =>
    !["documentation", "planning"].includes(discipline.id),
  ),
  { id: "documentation", code: "documentation", name: "Documentation" },
  { id: "planning", code: "planning", name: "Planning" },
];

export function getTaskDisciplineBucketForProject(
  project: Pick<Project, "name" | "projectType"> | null | undefined,
): TaskDisciplineBucket {
  const name = project?.name.toLowerCase() ?? "";

  if (project?.projectType === "robot" || /\brobot\b/.test(name)) {
    return "robot";
  }

  if (/\bmedia\b/.test(name)) {
    return "media";
  }

  if (project?.projectType === "outreach" || /\boutreach\b/.test(name)) {
    return "outreach";
  }

  if (/\bstrategy\b/.test(name)) {
    return "strategy";
  }

  if (/\btraining\b/.test(name) || /\bscouting\b/.test(name)) {
    return "training";
  }

  return "operations";
}

export function getTaskDisciplinesForProject(
  project: Pick<Project, "name" | "projectType"> | null | undefined,
) {
  switch (getTaskDisciplineBucketForProject(project)) {
    case "robot":
      return ROBOT_TASK_DISCIPLINES;
    case "media":
      return MEDIA_TASK_DISCIPLINES;
    case "outreach":
      return OUTREACH_TASK_DISCIPLINES;
    case "strategy":
      return STRATEGY_TASK_DISCIPLINES;
    case "training":
      return TRAINING_TASK_DISCIPLINES;
    default:
      return OPERATIONS_TASK_DISCIPLINES;
  }
}

export function isTaskDisciplineAllowedForProject(
  project: Pick<Project, "name" | "projectType"> | null | undefined,
  disciplineId: string,
) {
  return getTaskDisciplinesForProject(project).some(
    (discipline) => discipline.id === disciplineId,
  );
}

export function getDefaultTaskDisciplineIdForProject(
  project: Pick<Project, "name" | "projectType"> | null | undefined,
) {
  return getTaskDisciplinesForProject(project)[0]?.id ?? "";
}
