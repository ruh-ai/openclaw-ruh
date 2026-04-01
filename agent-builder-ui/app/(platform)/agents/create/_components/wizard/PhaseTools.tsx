"use client";

import { useMemo } from "react";
import { useWizard } from "./WizardContext";
import { StepConnectTools } from "../configure/StepConnectTools";

export function PhaseTools() {
  const { state } = useWizard();

  // Pass the AI-generated skill nodes so StepConnectTools can auto-detect
  // relevant tools from skill names, descriptions, requires_env, and external_api.
  const selectedNodes = useMemo(() => {
    return state.generatedNodes.filter((n) =>
      state.selectedSkillIds.includes(n.skill_id)
    );
  }, [state.generatedNodes, state.selectedSkillIds]);

  return (
    <StepConnectTools
      onContinue={() => {}}
      onCancel={() => {}}
      onSkip={() => {}}
      stepLabel=""
      skillGraph={selectedNodes.length > 0 ? selectedNodes : undefined}
      hideFooter
    />
  );
}
