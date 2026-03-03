import { EstatusWorkflow } from '../types';

export const WORKFLOW_TRANSITIONS: Record<EstatusWorkflow, EstatusWorkflow[]> = {
  [EstatusWorkflow.BORRADOR]: [EstatusWorkflow.EN_REVISION_DOCUMENTAL],
  [EstatusWorkflow.EN_REVISION_DOCUMENTAL]: [EstatusWorkflow.AUTORIZADO, EstatusWorkflow.RECHAZADO],
  [EstatusWorkflow.RECHAZADO]: [EstatusWorkflow.EN_REVISION_DOCUMENTAL, EstatusWorkflow.CERRADO],
  [EstatusWorkflow.AUTORIZADO]: [EstatusWorkflow.ENVIADO_A_OPTICA],
  [EstatusWorkflow.ENVIADO_A_OPTICA]: [EstatusWorkflow.EN_PROCESO_OPTICA],
  [EstatusWorkflow.EN_PROCESO_OPTICA]: [EstatusWorkflow.LISTO_PARA_ENTREGA],
  [EstatusWorkflow.LISTO_PARA_ENTREGA]: [EstatusWorkflow.ENTREGADO],
  [EstatusWorkflow.ENTREGADO]: [EstatusWorkflow.CERRADO],
  [EstatusWorkflow.CERRADO]: []
};

export interface WorkflowValidationResult {
  isValid: boolean;
  reason?: string;
  allowedNext: EstatusWorkflow[];
}

export const validateWorkflowTransition = (
  from: EstatusWorkflow,
  to: EstatusWorkflow
): WorkflowValidationResult => {
  const allowedNext = WORKFLOW_TRANSITIONS[from] ?? [];

  if (from === to) {
    return { isValid: true, allowedNext };
  }

  if (!allowedNext.includes(to)) {
    return {
      isValid: false,
      allowedNext,
      reason: `Transición inválida: ${from} -> ${to}. Siguientes estatus válidos: ${allowedNext.length ? allowedNext.join(', ') : 'NINGUNO'}.`
    };
  }

  return { isValid: true, allowedNext };
};
