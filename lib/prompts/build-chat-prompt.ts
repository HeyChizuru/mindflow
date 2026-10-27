import "server-only";
import { buildPrompt } from "@/lib/prompts";
import type { PromptId } from "@/lib/prompts/types";
import { CHAT_TEACHERS, type ChatTeacherId } from "@/lib/types/chat";

export function buildChatPrompt(id: Extract<PromptId, `chat-${string}`>, teacherId?: ChatTeacherId) {
  const roles: Record<ChatTeacherId, string> = {
    explainer: "Explain concepts, causes and prerequisites clearly, using examples when useful.",
    reasoning_coach: "Examine the learner's stated understanding and reasoning. Identify specific gaps. Answer direct questions; do not replace answers with repeated questions.",
    application_coach: "Connect knowledge to examples, projects and practice. Chat practice never changes formal quiz results.",
  };
  const chineseRoles: Record<ChatTeacherId, string> = {
    explainer: "清楚解释概念、原因与前置知识，适当使用例子帮助理解。",
    reasoning_coach: "检查用户明确表达的理解与推理，指出具体混淆和遗漏。直接回答问题，不以连续反问代替答疑。",
    application_coach: "把知识连接到案例、项目和练习，分析用户的应用尝试。聊天练习不产生或修改正式测验成绩。",
  };
  const result = buildPrompt(id, {
    teacherName: teacherId ? CHAT_TEACHERS[teacherId] : "",
    teacherRole: teacherId ? chineseRoles[teacherId] : "",
    teacherRoleEn: teacherId ? roles[teacherId] : "",
  });
  if (!result) throw new Error("Chat prompt unavailable");
  return result.system;
}
