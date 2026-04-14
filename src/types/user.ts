export interface UserProfile {
    hideWelcomeDialog?: boolean;
    id?: string;
    userId?: string;
    createdAt?: Date;
    updatedAt?: Date;
    [key: string]: unknown;
    currentPhase?: "introduction" | "goal_setting" | "action_planning";
} 