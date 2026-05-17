export interface StepProductDefinition {
  id: string;
  productId: string | null;
  name: string;
}

export interface StepAssemblyUsage {
  id: string;
  occurrenceName: string;
  parentProductDefinitionId: string;
  childProductDefinitionId: string;
}
