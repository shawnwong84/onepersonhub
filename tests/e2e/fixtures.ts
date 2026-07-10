import path from "node:path";

export const E2E_ADMIN_USERNAME = "admin";
export const E2E_ADMIN_PASSWORD = "admin123";

export const E2E_AGENT_USERNAME = "e2e-agent";
export const E2E_AGENT_PASSWORD = "E2eAgentPass123!";

export const ADMIN_STORAGE_STATE = path.join(__dirname, ".auth", "admin.json");
export const AGENT_STORAGE_STATE = path.join(__dirname, ".auth", "agent.json");

export interface E2eFixtureIds {
  memberId: string;
  assignedConversationId: string;
  unassignedConversationId: string;
}
