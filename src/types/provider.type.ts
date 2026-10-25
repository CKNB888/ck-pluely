export interface TYPE_PROVIDER {
  id?: string;
  streaming?: boolean;
  responseContentPath?: string;
  isCustom?: boolean;
  curl: string;
  /** ck-pluely: example model id shown as the MODEL field placeholder. */
  modelHint?: string;
}
